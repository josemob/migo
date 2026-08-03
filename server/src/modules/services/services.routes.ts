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

const CATEGORIES = [
  'CONSULTATION', 'VACCINATION', 'GROOMING', 'SURGERY', 'LAB',
  'IMAGING', 'DENTAL', 'EMERGENCY', 'DEWORMING', 'OTHER',
] as const;

// Categorías que exigen un veterinario con CMV verificado (regla de la pantalla)
const MEDICAL_CATEGORIES = new Set(['CONSULTATION', 'SURGERY', 'LAB', 'IMAGING', 'DENTAL', 'EMERGENCY']);

const serviceSchema = z.object({
  name: z.string().min(2),
  category: z.enum(CATEGORIES).default('CONSULTATION'),
  description: z.string().optional(),
  priceUsd: z.number().nonnegative(),
  priceLocal: z.number().nonnegative().optional(),
  durationMin: z.number().int().positive().default(30),
  isActive: z.boolean().default(true),
});

/** True if the clinic has at least one active VET with verified CMV. */
async function hasVerifiedVet(clinicId: string) {
  const count = await prisma.clinicStaff.count({
    where: { clinicId, position: 'VET', isActive: true, verificationStatus: 'VERIFIED' },
  });
  return count > 0;
}

// GET /services?category=CONSULTATION
router.get(
  '/',
  validate({ query: z.object({ category: z.enum(CATEGORIES).optional() }) }),
  asyncHandler(async (req, res) => {
    const services = await prisma.service.findMany({
      where: { clinicId: req.clinicId!, category: req.query.category as never },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    res.json({
      data: services,
      // bandera para el banner de alerta amarillo de la pantalla
      medicalServicesEnabled: await hasVerifiedVet(req.clinicId!),
    });
  }),
);

router.post(
  '/',
  requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validate({ body: serviceSchema }),
  asyncHandler(async (req, res) => {
    const requiresVet = MEDICAL_CATEGORIES.has(req.body.category);
    if (requiresVet && !(await hasVerifiedVet(req.clinicId!))) {
      throw ApiError.badRequest(
        'Los servicios médicos y quirúrgicos requieren al menos un Veterinario activo con Carnet CMV verificado.',
      );
    }
    const service = await prisma.service.create({
      data: { ...req.body, requiresVet, clinicId: req.clinicId! },
    });
    res.status(201).json(service);
  }),
);

router.patch(
  '/:id',
  requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validate({ params: z.object({ id: z.string().uuid() }), body: serviceSchema.partial() }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.service.findFirst({
      where: { id: req.params.id, clinicId: req.clinicId! },
    });
    if (!existing) throw ApiError.notFound('Servicio no encontrado');

    const category = req.body.category ?? existing.category;
    const requiresVet = MEDICAL_CATEGORIES.has(category);
    const service = await prisma.service.update({
      where: { id: existing.id },
      data: { ...req.body, requiresVet },
    });
    res.json(service);
  }),
);

router.delete(
  '/:id',
  requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    await prisma.service.deleteMany({ where: { id: req.params.id, clinicId: req.clinicId! } });
    res.status(204).send();
  }),
);

export default router;
