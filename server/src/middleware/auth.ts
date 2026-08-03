import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import { verifyAccessToken } from '../utils/jwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: UserRole };
    }
  }
}

/** Requires a valid Bearer access token; attaches req.user. */
export const authenticate = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('Falta el token de acceso'));
  }
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(ApiError.unauthorized('Token inválido o expirado'));
  }
};

/** Restricts a route to the given roles (use after authenticate). */
export const requireRole =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden('Tu rol no tiene acceso a este recurso'));
    }
    next();
  };
