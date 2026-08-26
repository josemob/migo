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
import { sendWelcomeEmail, sendPasswordResetEmail } from '../mail/mail.service';

interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  nationalId?: string;
  role?: UserRole;
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
            clinic: { include: { organization: true } },
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
