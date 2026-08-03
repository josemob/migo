import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string; // user id
  role: UserRole;
}

export const signAccessToken = (payload: AccessTokenPayload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'],
  });

export const verifyAccessToken = (token: string): AccessTokenPayload =>
  jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;

/** Opaque refresh token: a random string we store hashed in the DB. */
export const generateRefreshToken = () => crypto.randomBytes(48).toString('hex');

export const hashToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

/** Rough parser for "30d" / "15m" style TTLs into a future Date. */
export const ttlToDate = (ttl: string): Date => {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  const now = Date.now();
  if (!match) return new Date(now + 30 * 24 * 60 * 60 * 1000);
  const value = Number(match[1]);
  const unit = match[2] ?? 'd';
  const units: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const ms = units[unit] ?? 86_400_000;
  return new Date(now + value * ms);
};
