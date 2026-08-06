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
  // staff asignado que puede atender este servicio (ids de ClinicStaff de la sucursal)
  staffIds: z.array(z.string().uuid()).optional(),
});

/** True if the clinic has at least one active VET with verified CMV. */
async function hasVerifiedVet(clinicId: string) {
  const count = await prisma.clinicStaff.count({
    where: { clinicId, position: 'VET', isActive: true, verificationStatus: 'VERIFIED' },
  });
  return count > 0;
}

// Filtra los ids recibidos dejando solo staff que pertenece a esta sucursal.
async function validClinicStaffIds(clinicId: string, ids?: string[]) {
  if (!ids || ids.length === 0) return [];
  const rows = await prisma.clinicStaff.findMany({
    where: { id: { in: ids }, clinicId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

const serviceStaffInclude = {
  serviceStaff: { include: { staff: { include: { user: { select: { fullName: true } } } } } },
} as const;

// Aplana la relación serviceStaff -> arreglo `staff: [{ id, name, position }]`
function mapService(s: {
  serviceStaff?: { staffId: string; staff: { position: string; user: { fullName: string } } }[];
} & Record<string, unknown>) {
  const { serviceStaff, ...rest } = s;
  return {
    ...rest,
    staff: (serviceStaff ?? []).map((ss) => ({
      id: ss.staffId,
      name: ss.staff.user.fullName,
      position: ss.staff.position,
    })),
  };
}

// GET /services?category=CONSULTATION
router.get(
  '/',
  validate({ query: z.object({ category: z.enum(CATEGORIES).optional() }) }),
  asyncHandler(async (req, res) => {
    const services = await prisma.service.findMany({
      where: { clinicId: req.clinicId!, category: req.query.category as never },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: serviceStaffInclude,
    });
    res.json({
      data: services.map(mapService),
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
    const { staffIds, ...data } = req.body as typeof req.body & { staffIds?: string[] };
    const validStaff = await validClinicStaffIds(req.clinicId!, staffIds);
    const service = await prisma.service.create({
      data: {
        ...data,
        requiresVet,
        clinicId: req.clinicId!,
        serviceStaff: { create: validStaff.map((staffId) => ({ staffId })) },
      },
      include: serviceStaffInclude,
    });
    res.status(201).json(mapService(service));
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
    const { staffIds, ...data } = req.body as typeof req.body & { staffIds?: string[] };
    await prisma.service.update({
      where: { id: existing.id },
      data: { ...data, requiresVet },
    });
    // Si vienen staffIds, se reemplaza el set de asignaciones del servicio
    if (staffIds !== undefined) {
      const validStaff = await validClinicStaffIds(req.clinicId!, staffIds);
      await prisma.serviceStaff.deleteMany({ where: { serviceId: existing.id } });
      if (validStaff.length) {
        await prisma.serviceStaff.createMany({
          data: validStaff.map((staffId) => ({ serviceId: existing.id, staffId })),
        });
      }
    }
    const full = await prisma.service.findUnique({
      where: { id: existing.id },
      include: serviceStaffInclude,
    });
    res.json(mapService(full!));
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
