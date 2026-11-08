import { Router } from 'express';
import { z } from 'zod';
import { AppointmentStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { withClinicContext } from '../../middleware/clinicContext';
import { ApiError } from '../../utils/ApiError';
import { env } from '../../config/env';
import { sendPush } from '../push/push.service';
import { sendAppointmentConfirmedEmail } from '../mail/mail.service';

const router = Router();
router.use(authenticate, withClinicContext);

const detailInclude = {
  pet: { include: { owner: { select: { id: true, fullName: true, email: true, phone: true, nationalId: true } } } },
  service: true,
  clinic: { select: { name: true, address: true, phone: true } },
  vet: { include: { user: { select: { fullName: true } } } },
} as const;

// GET /appointments?from=&to=  -> agenda (día / semana)
router.get(
  '/',
  validate({
    query: z.object({
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      // Uno o varios estados separados por coma: "PENDING,CONFIRMED" (antes se aceptaba y se ignoraba)
      status: z.string().optional(),
      vetId: z.string().uuid().optional(),
      // mine=1 -> solo las citas asignadas a quien consulta + las que aún no tienen vet (app Vet)
      mine: z.enum(['1', 'true']).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { from, to, vetId, status, mine } = req.query as {
      from?: Date; to?: Date; vetId?: string; status?: string; mine?: string;
    };
    const statuses = status
      ?.split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s): s is AppointmentStatus => (Object.values(AppointmentStatus) as string[]).includes(s));
    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId: req.clinicId!,
        vetId,
        scheduledAt: { gte: from, lte: to },
        ...(statuses?.length ? { status: { in: statuses } } : {}),
        ...(mine && req.staffId ? { OR: [{ vetId: req.staffId }, { vetId: null }] } : {}),
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

// Transiciones válidas del ciclo de vida de una cita.
// El vet puede "marcar concluida" desde cualquier estado activo (PENDING/CONFIRMED/IN_PROGRESS).
const TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
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

    const next = req.body.status as AppointmentStatus;
    const cancelReason = (req.body.cancelReason as string | undefined)?.trim() || undefined;

    // Ya la aceptó otro miembro del equipo (todo el equipo recibe la solicitud): mensaje claro.
    if (next === 'CONFIRMED' && appt.status !== 'PENDING') {
      throw ApiError.conflict(await alreadyHandledMessage(appt.id));
    }
    const allowed = TRANSITIONS[appt.status] ?? [];
    if (!allowed.includes(next)) {
      throw ApiError.badRequest(`No se puede pasar de ${appt.status} a ${next}`);
    }
    // Rechazar una solicitud exige un motivo: es lo que lee el dueño.
    const rejecting = next === 'CANCELLED' && appt.status === 'PENDING';
    if (rejecting && (!cancelReason || cancelReason.length < 3)) {
      throw ApiError.badRequest('Escribe el motivo del rechazo para el dueño.');
    }
    // Aceptar bloquea el horario: no puede haber otra cita aceptada a la misma hora.
    if (next === 'CONFIRMED') {
      const clash = await prisma.appointment.findFirst({
        where: {
          clinicId: appt.clinicId,
          scheduledAt: appt.scheduledAt,
          status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
          id: { not: appt.id },
        },
        select: { id: true },
      });
      if (clash) throw ApiError.conflict('Ya hay otra cita aceptada a esa misma hora. Rechaza esta solicitud con el motivo.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      // updateMany condicionado al estado leído: si dos personas del equipo aceptan a la vez,
      // solo gana la primera (la segunda ve 0 filas y recibe "ya fue aceptada por…").
      const { count } = await tx.appointment.updateMany({
        where: { id: appt.id, status: appt.status },
        data: {
          status: next,
          cancelReason,
          // Quien acepta queda asignado. Al concluir se registra qué profesional atendió
          // (si no había uno), para que la reseña cuente también para ese veterinario.
          ...((next === 'CONFIRMED' || next === 'COMPLETED') && !appt.vetId && req.staffId
            ? { vetId: req.staffId }
            : {}),
        },
      });
      if (count === 0) return null;
      const result = await tx.appointment.findUniqueOrThrow({ where: { id: appt.id }, include: detailInclude });

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
    // Otro miembro del equipo la movió entre la lectura y la escritura.
    if (!updated) throw ApiError.conflict(await alreadyHandledMessage(appt.id));

    // Notifica al dueño el cambio de estado (no bloquea la respuesta)
    const ownerId = updated.pet?.owner?.id;
    const petName = updated.pet?.name ?? 'tu mascota';
    const when = formatWhen(updated.scheduledAt);
    if (ownerId) {
      const reasonTxt = cancelReason ? ` Motivo: ${cancelReason}` : '';
      const NOTIF: Partial<Record<string, { title: string; body: string }>> = {
        CONFIRMED: {
          title: '¡Tu cita fue aceptada! ✅',
          body: `${updated.clinic?.name ?? 'La clínica'} confirmó la cita de ${petName} · ${when}.`,
        },
        IN_PROGRESS: { title: 'En atención 🩺', body: `${petName} está siendo atendido(a) ahora.` },
        COMPLETED: { title: '¡Cita completada! 🎉', body: `La cita de ${petName} finalizó. Cuéntanos cómo te fue y califícala.` },
        CANCELLED: rejecting
          ? { title: 'La clínica no pudo aceptar tu cita', body: `${petName} · ${when}.${reasonTxt} Puedes elegir otro horario.` }
          : { title: 'Cita cancelada', body: `La cita de ${petName} (${when}) fue cancelada.${reasonTxt}` },
      };
      const n = NOTIF[next];
      if (n) void sendPush(ownerId, { ...n, data: { type: 'appointment', appointmentId: updated.id, status: next } });
    }

    // Correo con el resumen de la cita aceptada (además del push y la ventana en la app)
    if (next === 'CONFIRMED' && updated.pet?.owner?.email) {
      void sendAppointmentConfirmedEmail(updated.pet.owner.email, updated.pet.owner.fullName ?? '', {
        petName: updated.pet.name ?? 'tu mascota',
        clinicName: updated.clinic?.name ?? 'la clínica',
        clinicAddress: updated.clinic?.address ?? null,
        clinicPhone: updated.clinic?.phone ?? null,
        dateLabel: new Date(updated.scheduledAt).toLocaleString('es-VE', {
          timeZone: 'America/Caracas', dateStyle: 'full', timeStyle: 'short',
        }),
        serviceName: updated.service?.name ?? updated.reason ?? null,
        priceLabel: updated.priceUsd != null ? `$${Number(updated.priceUsd).toFixed(2)}` : null,
        vetName: updated.vet?.user?.fullName ?? null,
      }).catch(() => {});
    }

    res.json(updated);
  }),
);

/** "vie 14 nov · 10:30 a. m." en hora de Venezuela. */
function formatWhen(d: Date): string {
  return new Intl.DateTimeFormat('es-VE', {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Caracas',
  }).format(d);
}

/** Mensaje para quien intenta aceptar/rechazar una solicitud que otro ya resolvió. */
async function alreadyHandledMessage(id: string): Promise<string> {
  const a = await prisma.appointment.findUnique({
    where: { id },
    select: { status: true, vet: { select: { user: { select: { fullName: true } } } } },
  });
  if (a?.status === 'CANCELLED') return 'Esta solicitud ya fue rechazada o cancelada.';
  const who = a?.vet?.user?.fullName;
  return who ? `Esta cita ya fue aceptada por ${who}.` : 'Esta cita ya fue aceptada por otro miembro del equipo.';
}

export default router;
