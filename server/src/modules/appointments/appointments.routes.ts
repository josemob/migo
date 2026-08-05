import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { withClinicContext } from '../../middleware/clinicContext';
import { ApiError } from '../../utils/ApiError';
import { env } from '../../config/env';
import { sendPush } from '../push/push.service';

const router = Router();
router.use(authenticate, withClinicContext);

const detailInclude = {
  pet: { include: { owner: { select: { id: true, fullName: true, phone: true, nationalId: true } } } },
  service: true,
  vet: { include: { user: { select: { fullName: true } } } },
} as const;

// GET /appointments?from=&to=  -> agenda (día / semana)
router.get(
  '/',
  validate({
    query: z.object({
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      status: z.string().optional(),
      vetId: z.string().uuid().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { from, to, vetId } = req.query as { from?: Date; to?: Date; vetId?: string };
    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId: req.clinicId!,
        vetId,
        scheduledAt: { gte: from, lte: to },
      },
      include: detailInclude,
      orderBy: { scheduledAt: 'asc' },
    });
    res.json({ data: appointments });
  }),
);

// GET /appointments/:id -> "Detalle de Cita Seleccionada"
router.get(
  '/:id',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const appt = await prisma.appointment.findFirst({
      where: { id: req.params.id, clinicId: req.clinicId! },
      include: { ...detailInclude, record: true },
    });
    if (!appt) throw ApiError.notFound('Cita no encontrada');
    res.json(appt);
  }),
);

const createSchema = z.object({
  petId: z.string().uuid(),
  serviceId: z.string().uuid().optional(),
  vetId: z.string().uuid().optional(),
  scheduledAt: z.coerce.date(),
  reason: z.string().optional(),
  priceUsd: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

router.post(
  '/',
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const pet = await prisma.pet.findUnique({ where: { id: req.body.petId }, select: { ownerId: true } });
    if (!pet) throw ApiError.notFound('Mascota no encontrada');

    const appt = await prisma.appointment.create({
      data: {
        clinicId: req.clinicId!,
        petId: req.body.petId,
        bookedById: pet.ownerId,
        serviceId: req.body.serviceId,
        vetId: req.body.vetId,
        scheduledAt: req.body.scheduledAt,
        reason: req.body.reason,
        priceUsd: req.body.priceUsd,
        notes: req.body.notes,
      },
      include: detailInclude,
    });
    res.status(201).json(appt);
  }),
);

// PATCH /appointments/:id -> "Reprogramar Cita" / editar
router.patch(
  '/:id',
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: createSchema.partial().omit({ petId: true }),
  }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.appointment.findFirst({
      where: { id: req.params.id, clinicId: req.clinicId! },
    });
    if (!existing) throw ApiError.notFound('Cita no encontrada');
    const appt = await prisma.appointment.update({
      where: { id: existing.id },
      data: req.body,
      include: detailInclude,
    });
    res.json(appt);
  }),
);

// Transiciones válidas del ciclo de vida de una cita
const TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

// POST /appointments/:id/status  -> Confirmar Turno / Iniciar Atención / Completar
router.post(
  '/:id/status',
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      status: z.enum(['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
      cancelReason: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const appt = await prisma.appointment.findFirst({
      where: { id: req.params.id, clinicId: req.clinicId! },
    });
    if (!appt) throw ApiError.notFound('Cita no encontrada');

    const allowed = TRANSITIONS[appt.status] ?? [];
    if (!allowed.includes(req.body.status)) {
      throw ApiError.badRequest(`No se puede pasar de ${appt.status} a ${req.body.status}`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.appointment.update({
        where: { id: appt.id },
        data: { status: req.body.status, cancelReason: req.body.cancelReason },
        include: detailInclude,
      });

      // Al completar una cita pagada en la app, Migo registra su comisión
      if (req.body.status === 'COMPLETED' && appt.paidInApp && appt.priceUsd) {
        const gross = Number(appt.priceUsd);
        const clinic = await tx.clinic.findUnique({
          where: { id: req.clinicId! },
          select: { bookingCommissionRate: true },
        });
        const rate = clinic?.bookingCommissionRate
          ? Number(clinic.bookingCommissionRate)
          : env.BOOKING_COMMISSION_RATE;
        await tx.ledgerEntry.create({
          data: {
            type: 'BOOKING_COMMISSION',
            clinicId: req.clinicId!,
            appointmentId: appt.id,
            grossUsd: gross,
            migoFeeUsd: Number((gross * rate).toFixed(2)),
          },
        });
      }
      return result;
    });

    // Notifica al dueño el cambio de estado (no bloquea la respuesta)
    const ownerId = updated.pet?.owner?.id;
    const petName = updated.pet?.name ?? 'tu mascota';
    if (ownerId) {
      const NOTIF: Partial<Record<string, { title: string; body: string }>> = {
        CONFIRMED: { title: 'Cita confirmada ✅', body: `La cita de ${petName} fue confirmada por la clínica.` },
        IN_PROGRESS: { title: 'En atención 🩺', body: `${petName} está siendo atendido(a) ahora.` },
        COMPLETED: { title: '¡Cita completada! 🎉', body: `La cita de ${petName} finalizó. Cuéntanos cómo te fue y califícala.` },
        CANCELLED: { title: 'Cita cancelada', body: `La cita de ${petName} fue cancelada.` },
      };
      const n = NOTIF[req.body.status];
      if (n) void sendPush(ownerId, { ...n, data: { type: 'appointment', appointmentId: updated.id, status: req.body.status } });
    }

    res.json(updated);
  }),
);

export default router;
