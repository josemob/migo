import crypto from 'crypto';
import type { UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import { hashPassword, verifyPassword } from '../../utils/password';
import {
  generateRefreshToken,
  hashToken,
  signAccessToken,
  ttlToDate,
} from '../../utils/jwt';
import { env } from '../../config/env';
import {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendClinicSignupReceivedEmail,
  sendClinicSignupAdminEmail,
} from '../mail/mail.service';

interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  nationalId?: string;
  role?: UserRole;
}

export interface ClinicSignupInput {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  nationalId?: string;
  orgName: string;
  legalName?: string;
  rif: string;
  rifDocUrl: string;
  sanitaryPermitUrl?: string;
  clinicName: string;
  clinicPhone?: string;
  address: string;
  city: string;
  state?: string;
  latitude: number;
  longitude: number;
  isOpen24_7: boolean;
  acceptsEmergencies: boolean;
}

/** "j123456789" / "J-12345678-9" -> "J-12345678-9". null si no parece un RIF venezolano. */
export function normalizeRif(raw: string): string | null {
  const m = raw.toUpperCase().replace(/[\s.]/g, '').match(/^([JGVEPC])-?(\d{8})-?(\d)$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Avisa al equipo Migo (ADMIN_NOTIFY_EMAIL o, si no está, los SUPER_ADMIN). */
export async function notifyAdminsOfClinicRequest(d: Parameters<typeof sendClinicSignupAdminEmail>[1]) {
  let to = (env.ADMIN_NOTIFY_EMAIL ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!to.length) {
    const admins = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN' }, select: { email: true } });
    to = admins.map((a) => a.email);
  }
  if (to.length) await sendClinicSignupAdminEmail(to, d);
}

const publicUser = (u: {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone: string | null;
  avatarUrl: string | null;
}) => ({
  id: u.id,
  email: u.email,
  fullName: u.fullName,
  role: u.role,
  phone: u.phone,
  avatarUrl: u.avatarUrl,
});

async function issueTokens(user: { id: string; role: UserRole }, userAgent?: string) {
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: ttlToDate(env.JWT_REFRESH_TTL),
      userAgent,
    },
  });
  return { accessToken, refreshToken };
}

export const authService = {
  async register(input: RegisterInput, userAgent?: string) {
    const exists = await prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw ApiError.conflict('Ese email ya está registrado');

    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        fullName: input.fullName,
        phone: input.phone,
        nationalId: input.nationalId,
        role: input.role ?? 'PET_OWNER',
      },
    });

    // Correo de bienvenida (no bloquea el registro si el mail falla)
    void sendWelcomeEmail(user.email, user.fullName).catch(() => {});

    const tokens = await issueTokens(user, userAgent);
    return { user: publicUser(user), ...tokens };
  },

  /**
   * Autoregistro de una clínica desde el panel web: crea el usuario responsable
   * (CLINIC_ADMIN), la organización, la sede y su membresía como Admin Local.
   * Todo nace PENDING: puede entrar al panel y prepararse, pero no aparece en la
   * app (directorio/urgencias filtran VERIFIED) hasta que el Super Admin la aprueba.
   */
  async registerClinic(input: ClinicSignupInput, userAgent?: string) {
    const email = input.email.trim().toLowerCase();
    const rif = normalizeRif(input.rif);
    if (!rif) throw ApiError.badRequest('El RIF no tiene un formato válido (ej. J-12345678-9)');

    const [emailTaken, rifTaken] = await Promise.all([
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
      prisma.organization.findUnique({ where: { rif }, select: { id: true } }),
    ]);
    if (emailTaken) throw ApiError.conflict('Ese correo ya tiene una cuenta en Migo. Inicia sesión o usa otro correo.');
    if (rifTaken) throw ApiError.conflict('Ya existe una empresa registrada con ese RIF. Escríbenos si crees que es un error.');

    const passwordHash = await hashPassword(input.password);
    const { user, clinic } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, fullName: input.fullName.trim(), phone: input.phone, nationalId: input.nationalId, role: 'CLINIC_ADMIN' },
      });
      const org = await tx.organization.create({
        data: {
          ownerId: user.id,
          name: input.orgName.trim(),
          legalName: input.legalName?.trim() || null,
          rif,
          email,
          phone: input.phone,
          rifDocUrl: input.rifDocUrl,
          sanitaryPermitUrl: input.sanitaryPermitUrl ?? null,
        },
      });
      const clinic = await tx.clinic.create({
        data: {
          organizationId: org.id,
          name: input.clinicName.trim(),
          phone: input.clinicPhone || input.phone,
          email,
          address: input.address.trim(),
          city: input.city.trim(),
          state: input.state?.trim() || null,
          latitude: input.latitude,
          longitude: input.longitude,
          isOpen24_7: input.isOpen24_7,
          acceptsEmergencies: input.acceptsEmergencies,
        },
      });
      await tx.clinicStaff.create({
        data: { userId: user.id, clinicId: clinic.id, position: 'BRANCH_ADMIN', roleLabel: 'Administrador(a)' },
      });
      // Horario inicial editable desde Configuración (sin horario no se podrían pedir citas).
      await tx.clinicHours.createMany({
        data: [0, 1, 2, 3, 4, 5, 6].map((d) =>
          input.isOpen24_7
            ? { clinicId: clinic.id, dayOfWeek: d, opensAt: '00:00', closesAt: '23:59', isOpen: true }
            : d === 0
            ? { clinicId: clinic.id, dayOfWeek: d, opensAt: '09:00', closesAt: '13:00', isOpen: false }
            : d === 6
            ? { clinicId: clinic.id, dayOfWeek: d, opensAt: '09:00', closesAt: '13:00', isOpen: true }
            : { clinicId: clinic.id, dayOfWeek: d, opensAt: '08:00', closesAt: '18:00', isOpen: true },
        ),
      });
      return { user, clinic };
    });

    // Correos (no bloquean el registro si fallan)
    void sendClinicSignupReceivedEmail(user.email, user.fullName, clinic.name).catch(() => {});
    void notifyAdminsOfClinicRequest({
      clinicName: clinic.name, orgName: input.orgName, rif, city: input.city,
      ownerName: user.fullName, ownerEmail: user.email,
    }).catch(() => {});

    const tokens = await issueTokens(user, userAgent);
    return { user: publicUser(user), ...tokens };
  },

  // Solicita restablecer contraseña: envía un código de 6 dígitos al correo.
  // Nunca revela si el email existe (siempre resuelve OK).
  async requestPasswordReset(email: string) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, fullName: true } });
    if (!user) return;
    await prisma.passwordResetCode.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await prisma.passwordResetCode.create({
      data: { userId: user.id, codeHash: hashToken(code), expiresAt: new Date(Date.now() + 15 * 60_000) },
    });
    void sendPasswordResetEmail(user.email, user.fullName, code).catch(() => {});
  },

  // Restablece la contraseña con el código recibido por correo.
  async resetPassword(email: string, code: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) throw ApiError.badRequest('Código inválido o vencido');
    const rec = await prisma.passwordResetCode.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() }, codeHash: hashToken(code) },
      orderBy: { createdAt: 'desc' },
    });
    if (!rec) throw ApiError.badRequest('Código inválido o vencido');
    const passwordHash = await hashPassword(newPassword);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      prisma.passwordResetCode.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
      prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  },

  // Cambia la contraseña estando logueado (contraseña actual + nueva).
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, passwordHash: true } });
    if (!user) throw ApiError.notFound('Usuario no encontrado');
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw ApiError.badRequest('La contraseña actual no es correcta');
    }
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    // No revocamos la sesión actual: el usuario sigue dentro tras cambiarla.
  },

  /**
   * Inicia sesión (o registra) con un ID token de Google.
   * Verifica el token contra el endpoint público de Google y valida que el
   * `aud` sea uno de nuestros Client IDs (Web / Android cliente / Android vet).
   */
  async googleAuth(idToken: string, userAgent?: string) {
    if (!idToken) throw ApiError.badRequest('Falta el token de Google');

    let payload: {
      aud?: string;
      email?: string;
      email_verified?: string | boolean;
      name?: string;
      picture?: string;
      sub?: string;
    };
    try {
      const resp = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      );
      if (!resp.ok) throw new Error('tokeninfo ' + resp.status);
      payload = (await resp.json()) as typeof payload;
    } catch {
      throw ApiError.unauthorized('No se pudo verificar el token de Google');
    }

    const allowed = env.googleClientIds;
    if (allowed.length && (!payload.aud || !allowed.includes(payload.aud))) {
      throw ApiError.unauthorized('El token de Google no pertenece a esta app');
    }
    if (payload.email_verified !== true && payload.email_verified !== 'true') {
      throw ApiError.unauthorized('El correo de Google no está verificado');
    }
    const email = payload.email?.toLowerCase();
    if (!email) throw ApiError.unauthorized('Google no devolvió un correo');

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Sin contraseña utilizable: se autentica siempre por Google.
      const randomPw = crypto.randomUUID() + crypto.randomUUID();
      user = await prisma.user.create({
        data: {
          email,
          passwordHash: await hashPassword(randomPw),
          fullName: payload.name || email.split('@')[0] || email,
          avatarUrl: payload.picture ?? null,
          role: 'PET_OWNER',
        },
      });
    } else {
      if (user.status !== 'ACTIVE') throw ApiError.forbidden('La cuenta está suspendida');
      if (!user.avatarUrl && payload.picture) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl: payload.picture },
        });
      }
    }

    const tokens = await issueTokens(user, userAgent);
    return { user: publicUser(user), ...tokens };
  },

  async login(email: string, password: string, userAgent?: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw ApiError.unauthorized('Credenciales inválidas');
    }
    if (user.status !== 'ACTIVE') {
      throw ApiError.forbidden('La cuenta está suspendida');
    }
    const tokens = await issueTokens(user, userAgent);
    return { user: publicUser(user), ...tokens };
  },

  async refresh(refreshToken: string) {
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw ApiError.unauthorized('Sesión inválida o expirada');
    }
    // rotate: revoke old, issue new
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    const tokens = await issueTokens(stored.user, stored.userAgent ?? undefined);
    return { user: publicUser(stored.user), ...tokens };
  },

  async logout(refreshToken: string) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  async me(userId: string) {
    // Turno de HOY para el chip "Turno" del dashboard vet. StaffShift.date es @db.Date
    // (se lee como medianoche UTC), así que comparamos por la fecha-calendario de hoy
    // en Venezuela usando límites de medianoche UTC — no el instante VE (04:00 UTC).
    const { start: dayStart, end: dayEnd } = venezuelaTodayDateRange();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        staffProfile: {
          include: {
            // Sin los documentos (data URI pesados): solo lo que el panel necesita.
            clinic: {
              include: {
                organization: {
                  select: { id: true, name: true, legalName: true, rif: true, logoUrl: true, verificationStatus: true },
                },
              },
            },
            shifts: {
              where: { date: { gte: dayStart, lt: dayEnd }, shift: { not: 'OFF' } },
              orderBy: { date: 'desc' },
              take: 1,
            },
          },
        },
      },
    });
    if (!user) throw ApiError.notFound('Usuario no encontrado');
    // Aplana el turno de hoy en `currentShift` (o null si no tiene guardia hoy).
    const staffProfile = user.staffProfile
      ? { ...user.staffProfile, currentShift: user.staffProfile.shifts?.[0]?.shift ?? null }
      : null;
    return {
      ...publicUser(user),
      nationalId: user.nationalId,
      staffProfile,
    };
  },
};

// Rango [inicio, fin) de la fecha-calendario de HOY en Venezuela (UTC-4), expresado
// en medianoche UTC — para comparar contra columnas @db.Date (que se leen como
// medianoche UTC). Ej: si hoy en VE es 2026-08-19 -> [2026-08-19T00:00Z, 2026-08-20T00:00Z).
function venezuelaTodayDateRange(): { start: Date; end: Date } {
  const OFFSET_MS = 4 * 60 * 60 * 1000; // VE = UTC-4
  const ve = new Date(Date.now() - OFFSET_MS); // desplaza al "reloj de pared" de VE
  const start = new Date(Date.UTC(ve.getUTCFullYear(), ve.getUTCMonth(), ve.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
