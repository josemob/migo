import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      clinicId?: string;
      staffId?: string;
    }
  }
}

/**
 * Resolves the clinic (sucursal) the logged-in staff member operates in and
 * attaches req.clinicId / req.staffId. SUPER_ADMIN may target any clinic via
 * the `x-clinic-id` header or a `:clinicId` route param.
 */
export const withClinicContext = async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(ApiError.unauthorized());

  if (req.user.role === 'SUPER_ADMIN') {
    const clinicId =
      (req.params.clinicId as string | undefined) ??
      (req.headers['x-clinic-id'] as string | undefined);
    if (!clinicId) {
      return next(ApiError.badRequest('SUPER_ADMIN debe indicar la sucursal (x-clinic-id)'));
    }
    req.clinicId = clinicId;
    return next();
  }

  const staff = await prisma.clinicStaff.findUnique({
    where: { userId: req.user.id },
    select: { id: true, clinicId: true, isActive: true },
  });
  if (!staff || !staff.isActive) {
    return next(ApiError.forbidden('No estás vinculado a ninguna sucursal activa'));
  }
  req.clinicId = staff.clinicId;
  req.staffId = staff.id;
  next();
};
