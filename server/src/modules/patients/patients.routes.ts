import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { withClinicContext } from '../../middleware/clinicContext';
import { ApiError } from '../../utils/ApiError';

const router = Router();
router.use(authenticate, withClinicContext);

// GET /patients?search=&by=name|nationalId|microchip
router.get(
  '/',
  validate({
    query: z.object({
      search: z.string().optional(),
      by: z.enum(['name', 'nationalId', 'microchip']).default('name'),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { search, by } = req.query as { search?: string; by: string };

    // Búsqueda directa por microchip o cédula del dueño = admisión (alcance global)
    if (search && by === 'microchip') {
      const pet = await prisma.pet.findUnique({
        where: { microchip: search },
        include: { owner: { select: { fullName: true, nationalId: true, phone: true } } },
      });
      return res.json({ data: pet ? [pet] : [] });
    }
    if (search && by === 'nationalId') {
      const pets = await prisma.pet.findMany({
        where: { owner: { nationalId: { contains: search, mode: 'insensitive' } } },
        include: { owner: { select: { fullName: true, nationalId: true, phone: true } } },
      });
      return res.json({ data: pets });
    }

    // Por defecto: pacientes vinculados a esta sucursal (citas / historiales / urgencias)
    const pets = await prisma.pet.findMany({
      where: {
        name: search ? { contains: search, mode: 'insensitive' } : undefined,
        OR: [
          { appointments: { some: { clinicId: req.clinicId! } } },
          { records: { some: { clinicId: req.clinicId! } } },
          { emergencies: { some: { acceptedClinicId: req.clinicId! } } },
        ],
      },
      include: {
        owner: { select: { fullName: true, nationalId: true, phone: true } },
        records: { orderBy: { visitedAt: 'desc' }, take: 1, select: { visitedAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    res.json({ data: pets });
  }),
);

// GET /patients/:petId -> "Ficha Médica" completa
router.get(
  '/:petId',
  validate({ params: z.object({ petId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const pet = await prisma.pet.findUnique({
      where: { id: req.params.petId },
      include: {
        owner: { select: { id: true, fullName: true, phone: true, nationalId: true } },
        allergies: true,
        conditions: { where: { isActive: true } },
        vaccinations: { orderBy: { appliedAt: 'desc' } },
        prescriptions: { orderBy: { createdAt: 'desc' }, take: 10 },
        records: {
          orderBy: { visitedAt: 'desc' },
          include: { vet: { include: { user: { select: { fullName: true } } } } },
        },
      },
    });
    if (!pet) throw ApiError.notFound('Paciente no encontrado');
    res.json(pet);
  }),
);

// POST /patients/:petId/records -> nueva entrada al historial de visitas
router.post(
  '/:petId/records',
  validate({
    params: z.object({ petId: z.string().uuid() }),
    body: z.object({
      reason: z.string().optional(),
      symptoms: z.string().optional(),
      diagnosis: z.string().optional(),
      treatment: z.string().optional(),
      weightKg: z.number().positive().optional(),
      temperature: z.number().optional(),
      notes: z.string().optional(),
      sign: z.boolean().optional(), // "Finalizar y firmar": deja el expediente firmado por el vet
      prescriptions: z
        .array(
          z.object({
            drug: z.string(),
            dose: z.string().optional(),
            frequency: z.string().optional(),
            durationDays: z.number().int().positive().optional(),
            instructions: z.string().optional(),
          }),
        )
        .optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { prescriptions, sign, ...record } = req.body;
    const created = await prisma.medicalRecord.create({
      data: {
        ...record,
        signedAt: sign ? new Date() : null,
        petId: req.params.petId,
        clinicId: req.clinicId!,
        vetId: req.staffId,
        prescriptions: prescriptions?.length
          ? {
              create: prescriptions.map((p: Record<string, unknown>) => ({
                ...p,
                petId: req.params.petId,
                prescribedById: req.staffId,
              })),
            }
          : undefined,
      },
      include: { prescriptions: true },
    });
    res.status(201).json(created);
  }),
);

// POST /patients/:petId/vaccinations
router.post(
  '/:petId/vaccinations',
  validate({
    params: z.object({ petId: z.string().uuid() }),
    body: z.object({
      vaccineName: z.string(),
      lotNumber: z.string().optional(),
      appliedAt: z.coerce.date(),
      nextDueAt: z.coerce.date().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const vax = await prisma.vaccination.create({
      data: {
        ...req.body,
        petId: req.params.petId,
        clinicId: req.clinicId!,
        appliedById: req.staffId,
      },
    });
    res.status(201).json(vax);
  }),
);

// POST /patients/:petId/allergies
router.post(
  '/:petId/allergies',
  validate({
    params: z.object({ petId: z.string().uuid() }),
    body: z.object({
      substance: z.string(),
      severity: z.enum(['MILD', 'MODERATE', 'SEVERE', 'CRITICAL']).default('MODERATE'),
      reaction: z.string().optional(),
      notes: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const allergy = await prisma.allergy.create({
      data: { ...req.body, petId: req.params.petId },
    });
    res.status(201).json(allergy);
  }),
);

// PATCH /patients/:petId -> actualizar estado clínico / datos base
router.patch(
  '/:petId',
  validate({
    params: z.object({ petId: z.string().uuid() }),
    body: z.object({
      status: z.enum(['STABLE', 'IN_TREATMENT', 'URGENT', 'CRITICAL', 'INACTIVE']).optional(),
      weightKg: z.number().positive().optional(),
      bloodType: z.string().optional(),
      notes: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const pet = await prisma.pet.update({ where: { id: req.params.petId }, data: req.body });
    res.json(pet);
  }),
);

export default router;
