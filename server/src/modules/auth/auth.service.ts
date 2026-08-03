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
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        staffProfile: {
          include: { clinic: { include: { organization: true } } },
        },
      },
    });
    if (!user) throw ApiError.notFound('Usuario no encontrado');
    return {
      ...publicUser(user),
      nationalId: user.nationalId,
      staffProfile: user.staffProfile,
    };
  },
};
