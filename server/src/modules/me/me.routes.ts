import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { ApiError } from '../../utils/ApiError';

const router = Router();
router.use(authenticate);

const SPECIES = ['DOG', 'CAT', 'BIRD', 'RABBIT', 'REPTILE', 'RODENT', 'OTHER'] as const;

// GET /me/pets -> mascotas del dueño
router.get(
  '/pets',
  asyncHandler(async (req, res) => {
    const pets = await prisma.pet.findMany({
      where: { ownerId: req.user!.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: pets });
  }),
);

// POST /me/pets -> registrar mascota
const petSchema = z.object({
  name: z.string().min(1),
  species: z.enum(SPECIES),
  breed: z.string().optional(),
  sex: z.enum(['MALE', 'FEMALE', 'UNKNOWN']).default('UNKNOWN'),
  birthDate: z.coerce.date().optional(),
  weightKg: z.number().positive().optional(),
  bloodType: z.string().optional(),
  color: z.string().optional(),
  photoUrl: z.string().url().optional(),
  microchip: z.string().optional(),
  notes: z.string().optional(),
});

router.post(
  '/pets',
  validate({ body: petSchema }),
  asyncHandler(async (req, res) => {
    const pet = await prisma.pet.create({ data: { ...req.body, ownerId: req.user!.id } });
    res.status(201).json(pet);
  }),
);

// GET /me/pets/:id -> ficha médica completa (expediente del dueño)
router.get(
  '/pets/:id',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const pet = await prisma.pet.findFirst({
      where: { id: req.params.id, ownerId: req.user!.id },
      include: {
        allergies: true,
        conditions: { where: { isActive: true } },
        vaccinations: { orderBy: { appliedAt: 'desc' } },
        prescriptions: { orderBy: { createdAt: 'desc' }, take: 10 },
        records: {
          orderBy: { visitedAt: 'desc' },
          include: { clinic: { select: { name: true } } },
        },
      },
    });
    if (!pet) throw ApiError.notFound('Mascota no encontrada');
    res.json(pet);
  }),
);

// PATCH /me/pets/:id
router.patch(
  '/pets/:id',
  validate({ params: z.object({ id: z.string().uuid() }), body: petSchema.partial() }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.pet.findFirst({
      where: { id: req.params.id, ownerId: req.user!.id },
    });
    if (!existing) throw ApiError.notFound('Mascota no encontrada');
    const pet = await prisma.pet.update({ where: { id: existing.id }, data: req.body });
    res.json(pet);
  }),
);

// POST /me/pets/:id/allergies -> el dueño puede declarar alergias conocidas
router.post(
  '/pets/:id/allergies',
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      substance: z.string(),
      severity: z.enum(['MILD', 'MODERATE', 'SEVERE', 'CRITICAL']).default('MODERATE'),
      reaction: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const pet = await prisma.pet.findFirst({
      where: { id: req.params.id, ownerId: req.user!.id },
    });
    if (!pet) throw ApiError.notFound('Mascota no encontrada');
    const allergy = await prisma.allergy.create({ data: { ...req.body, petId: pet.id } });
    res.status(201).json(allergy);
  }),
);

export default router;
