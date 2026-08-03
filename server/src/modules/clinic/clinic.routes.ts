import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate, requireRole } from '../../middleware/auth';
import { withClinicContext } from '../../middleware/clinicContext';
import { ApiError } from '../../utils/ApiError';

const router = Router();
router.use(authenticate, withClinicContext);

// GET /clinic -> perfil de la sucursal + comercio + horarios + cuenta de liquidación
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const clinic = await prisma.clinic.findUnique({
      where: { id: req.clinicId! },
      include: {
        organization: true,
        hours: { orderBy: { dayOfWeek: 'asc' } },
        settlementAccount: true,
      },
    });
    if (!clinic) throw ApiError.notFound('Sucursal no encontrada');
    res.json(clinic);
  }),
);

// PATCH /clinic -> "Configuración del Comercio" (perfil + GPS)
const profileSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  logoUrl: z.string().url().optional(),
  coverUrl: z.string().url().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  isOpen24_7: z.boolean().optional(),
  acceptsEmergencies: z.boolean().optional(),
});

router.patch(
  '/',
  requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validate({ body: profileSchema }),
  asyncHandler(async (req, res) => {
    const clinic = await prisma.clinic.update({ where: { id: req.clinicId! }, data: req.body });
    res.json(clinic);
  }),
);

// PUT /clinic/hours -> "Horarios de Atención Semanal" (reemplaza los 7 días)
const daySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  opensAt: z.string().regex(/^\d{2}:\d{2}$/),
  closesAt: z.string().regex(/^\d{2}:\d{2}$/),
  isOpen: z.boolean().default(true),
  isOnCall: z.boolean().default(false),
});

router.put(
  '/hours',
  requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validate({ body: z.object({ hours: z.array(daySchema).max(7) }) }),
  asyncHandler(async (req, res) => {
    const clinicId = req.clinicId!;
    await prisma.$transaction([
      prisma.clinicHours.deleteMany({ where: { clinicId } }),
      prisma.clinicHours.createMany({
        data: req.body.hours.map((h: Record<string, unknown>) => ({ ...h, clinicId })),
      }),
    ]);
    const hours = await prisma.clinicHours.findMany({
      where: { clinicId },
      orderBy: { dayOfWeek: 'asc' },
    });
    res.json({ data: hours });
  }),
);

export default router;
