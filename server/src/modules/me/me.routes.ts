import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { ApiError } from '../../utils/ApiError';
import { migoAiReply } from '../chat/aiChat.service';
import { extractChatSummary } from '../chat/chatSummary.service';
import { createStreamCredentials, streamConfigured, ensureChatChannel } from '../stream/stream.service';
import { registerPushToken, removePushToken } from '../push/push.service';

const router = Router();
router.use(authenticate);

const SPECIES = ['DOG', 'CAT', 'BIRD', 'RABBIT', 'REPTILE', 'RODENT', 'OTHER'] as const;

// PATCH /me -> actualizar el perfil del dueño (nombre, teléfono, foto de perfil)
router.patch(
  '/',
  validate({
    body: z.object({
      fullName: z.string().min(2).optional(),
      phone: z.string().optional(),
      avatarUrl: z.string().optional(), // URL o data URI
    }),
  }),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: req.body,
      select: { id: true, email: true, fullName: true, phone: true, avatarUrl: true, role: true },
    });
    res.json(user);
  }),
);

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
  photoUrl: z.string().optional(), // URL o data URI (base64)
  microchip: z.string().optional(),
  notes: z.string().optional(),
  alias: z.string().optional(),
  size: z.string().optional(),
  specialCondition: z.string().optional(),
  frequentVet: z.string().optional(),
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

// PATCH /me/pets/:id -> editar campos de la mascota (+ alergias como texto)
router.patch(
  '/pets/:id',
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: petSchema.partial().extend({ allergiesText: z.string().optional() }),
  }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.pet.findFirst({
      where: { id: req.params.id, ownerId: req.user!.id },
    });
    if (!existing) throw ApiError.notFound('Mascota no encontrada');

    const { allergiesText, ...petData } = req.body as Record<string, unknown> & { allergiesText?: string };

    const pet = await prisma.$transaction(async (tx) => {
      const updated = await tx.pet.update({ where: { id: existing.id }, data: petData });
      // "Alergias Conocidas" se edita como texto libre: reemplaza los registros
      if (allergiesText !== undefined) {
        await tx.allergy.deleteMany({ where: { petId: existing.id } });
        if (allergiesText.trim()) {
          await tx.allergy.create({ data: { petId: existing.id, substance: allergiesText.trim() } });
        }
      }
      return updated;
    });
    res.json(pet);
  }),
);

// DELETE /me/pets/:id -> eliminar el perfil de la mascota (y su historial)
router.delete(
  '/pets/:id',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const pet = await prisma.pet.findFirst({ where: { id: req.params.id, ownerId: req.user!.id } });
    if (!pet) throw ApiError.notFound('Mascota no encontrada');

    await prisma.$transaction(
      async (tx) => {
        const petId = pet.id;
        const emgIds = (await tx.emergency.findMany({ where: { petId }, select: { id: true } })).map((e) => e.id);
        const apptIds = (await tx.appointment.findMany({ where: { petId }, select: { id: true } })).map((a) => a.id);
        const teleIds = (await tx.teleconsult.findMany({ where: { petId }, select: { id: true } })).map((t) => t.id);

        await tx.ledgerEntry.deleteMany({
          where: { OR: [{ emergencyId: { in: emgIds } }, { appointmentId: { in: apptIds } }, { teleconsultId: { in: teleIds } }] },
        });
        await tx.review.deleteMany({ where: { appointmentId: { in: apptIds } } });
        await tx.medicalRecord.deleteMany({ where: { petId } }); // cascada de Pet igual, explícito por orden FK
        await tx.emergency.deleteMany({ where: { id: { in: emgIds } } });
        await tx.teleconsult.deleteMany({ where: { id: { in: teleIds } } });
        await tx.appointment.deleteMany({ where: { id: { in: apptIds } } });
        await tx.pet.delete({ where: { id: petId } }); // cascada: allergies, conditions, vaccinations, prescriptions
      },
      { timeout: 20000 },
    );
    res.status(204).send();
  }),
);

// ─────────────────────────────────────────────────────────────────────
//  CITAS DEL DUEÑO (cliente) — reserva desde el directorio de la app
// ─────────────────────────────────────────────────────────────────────

// GET /me/appointments -> citas del dueño (más recientes primero)
router.get(
  '/appointments',
  asyncHandler(async (req, res) => {
    const appts = await prisma.appointment.findMany({
      where: { bookedById: req.user!.id },
      orderBy: { scheduledAt: 'desc' },
      include: {
        clinic: { select: { id: true, name: true, logoUrl: true, phone: true } },
        service: { select: { name: true, category: true } },
        pet: { select: { name: true, photoUrl: true } },
      },
    });
    res.json({ data: appts });
  }),
);

// GET /me/appointments/next -> próxima cita (recordatorio del Home).
// Incluye las citas de HOY aunque su hora ya haya pasado (desde el inicio del día en
// hora de Venezuela, UTC-4), para que "Próxima cita" no desaparezca a media jornada.
function startOfTodayVenezuela(): Date {
  const OFFSET_MS = 4 * 60 * 60 * 1000; // VE = UTC-4
  const ve = new Date(Date.now() - OFFSET_MS);
  const veMidnight = Date.UTC(ve.getUTCFullYear(), ve.getUTCMonth(), ve.getUTCDate(), 0, 0, 0, 0);
  return new Date(veMidnight + OFFSET_MS);
}
router.get(
  '/appointments/next',
  asyncHandler(async (req, res) => {
    const appointment = await prisma.appointment.findFirst({
      where: {
        bookedById: req.user!.id,
        status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
        scheduledAt: { gte: startOfTodayVenezuela() },
      },
      orderBy: { scheduledAt: 'asc' },
      include: {
        clinic: { select: { id: true, name: true, logoUrl: true } },
        service: { select: { name: true, category: true } },
        pet: { select: { name: true } },
      },
    });
    res.json({ appointment });
  }),
);

// POST /me/push-token -> registra el Expo push token del device
router.post(
  '/push-token',
  validate({ body: z.object({ token: z.string().min(1), platform: z.string().optional() }) }),
  asyncHandler(async (req, res) => {
    await registerPushToken(req.user!.id, req.body.token, req.body.platform);
    res.status(204).end();
  }),
);

// DELETE /me/push-token -> baja el token (logout)
router.delete(
  '/push-token',
  validate({ body: z.object({ token: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    await removePushToken(req.body.token);
    res.status(204).end();
  }),
);

// GET /me/care-calendar -> eventos del calendario de cuidados
//   type "appointment": citas reales (barra morada, "Ver Cita")
//   type "suggestion":  refuerzos/vacunas que tocan según el esquema (barra ámbar, "Agendar Ahora")
router.get(
  '/care-calendar',
  asyncHandler(async (req, res) => {
    const ownerId = req.user!.id;
    const now = new Date();
    const from = new Date(now.getTime() - 45 * 24 * 3600_000); // 45 días atrás
    const to = new Date(now.getTime() + 90 * 24 * 3600_000); // 90 días adelante

    const aiFrom = new Date(now.getTime() - 14 * 24 * 3600_000); // sugerencias IA de los últimos 14 días
    const [appts, vaccines, pets, intervals, summaries] = await Promise.all([
      prisma.appointment.findMany({
        where: { bookedById: ownerId, status: { not: 'CANCELLED' } },
        orderBy: { scheduledAt: 'asc' },
        include: {
          clinic: { select: { id: true, name: true } },
          service: { select: { name: true, category: true } },
          pet: { select: { id: true, name: true } },
        },
      }),
      // Vacunas con refuerzo próximo (o recién vencido) => sugerencia de Migo
      prisma.vaccination.findMany({
        where: { nextDueAt: { gte: from, lte: to }, pet: { ownerId } },
        orderBy: { nextDueAt: 'asc' },
        include: { pet: { select: { id: true, name: true } }, clinic: { select: { id: true, name: true } } },
      }),
      prisma.pet.findMany({ where: { ownerId }, select: { id: true, name: true, breed: true, createdAt: true } }),
      prisma.groomingBreedInterval.findMany(),
      // Resúmenes recientes del chat de Migo IA con una acción recomendada
      prisma.chatSummary.findMany({
        where: { ownerId, createdAt: { gte: aiFrom } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Última peluquería COMPLETADA por mascota (para el intervalo por raza)
    const lastGrooming = new Map<string, Date>();
    for (const a of appts) {
      if (a.service?.category === 'GROOMING' && a.status === 'COMPLETED') {
        const prev = lastGrooming.get(a.pet.id);
        if (!prev || a.scheduledAt > prev) lastGrooming.set(a.pet.id, a.scheduledAt);
      }
    }
    const intervalByBreed = new Map(intervals.map((i) => [i.breed.trim().toLowerCase(), i.intervalDays]));
    const petName = new Map(pets.map((p) => [p.id, p.name]));

    // Sugerencia de peluquería: si desde la última (o el registro) pasó el intervalo de la raza
    const groomingSuggestions = pets.flatMap((pet) => {
      const days = pet.breed ? intervalByBreed.get(pet.breed.trim().toLowerCase()) : undefined;
      if (!days) return [];
      const base = lastGrooming.get(pet.id) ?? pet.createdAt;
      const due = new Date(base.getTime() + days * 24 * 3600_000);
      if (due.getTime() > to.getTime()) return []; // aún no toca dentro de la ventana
      const when = due.getTime() < now.getTime() ? now : due; // vencida -> hoy
      return [{
        kind: 'suggestion' as const,
        id: `grooming-${pet.id}`,
        source: 'grooming' as const,
        title: `Peluquería de ${pet.name}`,
        date: when.toISOString(),
        petId: pet.id,
        petName: pet.name,
        clinicId: null,
        clinicName: null,
        description: `Según su raza (${pet.breed}), Migo recomienda peluquería cada ${days} días.`,
      }];
    });

    // Sugerencia de Migo IA: la más reciente por mascota, con acción recomendada
    const aiSeen = new Set<string>();
    const aiSuggestions = summaries.flatMap((s) => {
      const key = s.petId ?? 'sin-mascota';
      if (aiSeen.has(key) || !s.recommendedAction) return [];
      aiSeen.add(key);
      return [{
        kind: 'suggestion' as const,
        id: `ai-${s.id}`,
        source: 'ai' as const,
        title: s.consultationReason || 'Sugerencia de Migo IA',
        date: new Date(Math.max(now.getTime(), s.createdAt.getTime())).toISOString(),
        petId: s.petId,
        petName: s.petId ? petName.get(s.petId) ?? null : null,
        clinicId: null,
        clinicName: null,
        description: s.recommendedAction,
      }];
    });

    const events = [
      ...appts.map((a) => ({
        kind: 'appointment' as const,
        id: a.id,
        source: 'appointment' as const,
        title: a.service?.name ?? a.reason ?? 'Cita veterinaria',
        date: a.scheduledAt.toISOString(),
        status: a.status,
        petId: a.pet.id,
        petName: a.pet.name,
        clinicId: a.clinic.id,
        clinicName: a.clinic.name,
      })),
      ...vaccines.map((v) => ({
        kind: 'suggestion' as const,
        id: v.id,
        source: 'vaccine' as const,
        title: `Refuerzo: ${v.vaccineName}`,
        date: v.nextDueAt!.toISOString(),
        petId: v.pet.id,
        petName: v.pet.name,
        clinicId: v.clinic?.id ?? null,
        clinicName: v.clinic?.name ?? null,
        description: 'Migo detectó que le toca este refuerzo según su esquema de vacunación.',
      })),
      ...groomingSuggestions,
      ...aiSuggestions,
    ].sort((x, y) => x.date.localeCompare(y.date));

    res.json({ events });
  }),
);

// POST /me/appointments -> el dueño reserva una cita en una clínica del directorio
router.post(
  '/appointments',
  validate({
    body: z.object({
      clinicId: z.string().uuid(),
      petId: z.string().uuid(),
      serviceId: z.string().uuid().optional(),
      scheduledAt: z.coerce.date(),
      reason: z.string().optional(),
      paid: z.boolean().optional(),
      paymentRef: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { clinicId, petId, serviceId, scheduledAt, reason, paid } = req.body as {
      clinicId: string; petId: string; serviceId?: string; scheduledAt: Date; reason?: string; paid?: boolean;
    };

    // 1) La mascota debe pertenecer al dueño autenticado
    const pet = await prisma.pet.findFirst({ where: { id: petId, ownerId: req.user!.id }, select: { id: true } });
    if (!pet) throw ApiError.notFound('Mascota no encontrada');

    // 2) La clínica debe existir y estar verificada
    const clinic = await prisma.clinic.findFirst({
      where: { id: clinicId, verificationStatus: 'VERIFIED' },
      select: { id: true },
    });
    if (!clinic) throw ApiError.notFound('Clínica no encontrada');

    // 3) Si hay servicio, debe pertenecer a la clínica y estar activo -> deriva precio y motivo
    let priceUsd: number | undefined;
    let derivedReason = reason;
    if (serviceId) {
      const svc = await prisma.service.findFirst({
        where: { id: serviceId, clinicId, isActive: true },
        select: { name: true, priceUsd: true },
      });
      if (!svc) throw ApiError.badRequest('El servicio no pertenece a esta clínica.');
      priceUsd = Number(svc.priceUsd);
      derivedReason = reason ?? svc.name;
    }

    // 4) No permitir reservar en el pasado
    if (scheduledAt.getTime() < Date.now() - 60_000) throw ApiError.badRequest('La fecha de la cita ya pasó.');

    const appt = await prisma.appointment.create({
      data: {
        clinicId,
        petId,
        bookedById: req.user!.id,
        serviceId,
        scheduledAt,
        reason: derivedReason,
        priceUsd,
        paidInApp: !!paid,
        status: 'PENDING',
      },
      include: {
        clinic: { select: { name: true } },
        service: { select: { name: true } },
        pet: { select: { name: true } },
      },
    });
    res.status(201).json(appt);
  }),
);

// GET /me/appointments/pending-review -> última cita COMPLETADA sin calificar (para pedir reseña)
router.get(
  '/appointments/pending-review',
  asyncHandler(async (req, res) => {
    const appointment = await prisma.appointment.findFirst({
      where: { bookedById: req.user!.id, status: 'COMPLETED', review: { is: null } },
      orderBy: { scheduledAt: 'desc' },
      include: {
        clinic: { select: { id: true, name: true, logoUrl: true } },
        service: { select: { name: true } },
        pet: { select: { name: true } },
        vet: { select: { user: { select: { fullName: true } } } },
      },
    });
    res.json({ appointment });
  }),
);

// POST /me/appointments/:id/review -> calificar una cita (crea Review + actualiza el rating de la clínica)
router.post(
  '/appointments/:id/review',
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      rating: z.number().int().min(1).max(5),
      comment: z.string().max(500).optional(),
      tags: z.array(z.string()).max(6).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const appt = await prisma.appointment.findFirst({
      where: { id: req.params.id, bookedById: req.user!.id },
      include: {
        review: true,
        clinic: { select: { id: true, ratingAvg: true, ratingCount: true } },
        vet: { select: { id: true, ratingAvg: true, ratingCount: true } },
      },
    });
    if (!appt) throw ApiError.notFound('Cita no encontrada');
    if (appt.review) throw ApiError.conflict('Esta cita ya fue calificada.');

    const { rating, comment, tags } = req.body as { rating: number; comment?: string; tags?: string[] };
    const fullComment = [comment?.trim(), tags?.length ? tags.join(' · ') : undefined].filter(Boolean).join('\n');

    const result = await prisma.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: {
          appointmentId: appt.id,
          clinicId: appt.clinicId,
          authorId: req.user!.id,
          staffId: appt.vetId ?? undefined, // la reseña cuenta también para el vet que atendió
          rating,
          comment: fullComment || undefined,
        },
      });
      // Recalcula el promedio de la clínica de forma incremental
      const oldCount = appt.clinic.ratingCount;
      const oldAvg = Number(appt.clinic.ratingAvg);
      const ratingCount = oldCount + 1;
      const ratingAvg = Number(((oldAvg * oldCount + rating) / ratingCount).toFixed(2));
      await tx.clinic.update({ where: { id: appt.clinicId }, data: { ratingAvg, ratingCount } });

      // ...y el promedio del profesional (veterinario) que atendió, si lo hubo
      if (appt.vet) {
        const vCount = appt.vet.ratingCount + 1;
        const vAvg = Number(
          ((Number(appt.vet.ratingAvg) * appt.vet.ratingCount + rating) / vCount).toFixed(2),
        );
        await tx.clinicStaff.update({ where: { id: appt.vet.id }, data: { ratingAvg: vAvg, ratingCount: vCount } });
      }
      return { review, ratingAvg, ratingCount };
    });

    res.status(201).json(result);
  }),
);

// GET /me/stream-token -> credenciales de GetStream para el DUEÑO (rol customer)
router.get(
  '/stream-token',
  asyncHandler(async (req, res) => {
    if (!streamConfigured()) throw ApiError.badRequest('GetStream no está configurado en el servidor.');
    const me = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, fullName: true, avatarUrl: true },
    });
    const cred = await createStreamCredentials({ id: me!.id, name: me!.fullName, image: me!.avatarUrl, migoRole: 'customer' });
    res.json(cred);
  }),
);

// ─────────────────────────────────────────────────────────────────────
//  CHAT IA (Migo IA) — conversacional con Gemini, stateless
// ─────────────────────────────────────────────────────────────────────
router.post(
  '/ai-chat',
  validate({
    body: z.object({
      messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().min(1).max(2000) })).min(1).max(30),
      petId: z.string().uuid().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { messages, petId } = req.body as { messages: { role: 'user' | 'assistant'; text: string }[]; petId?: string };
    const [me, pet] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.user!.id }, select: { fullName: true } }),
      petId
        ? prisma.pet.findFirst({ where: { id: petId, ownerId: req.user!.id }, select: { name: true, species: true, breed: true } })
        : Promise.resolve(null),
    ]);
    const reply = await migoAiReply({ messages, pet, ownerName: me?.fullName?.split(' ')[0] });
    res.json(reply);
  }),
);

// POST /me/ai-chat/summary -> al finalizar la interacción: extrae resumen estructurado y lo almacena
router.post(
  '/ai-chat/summary',
  validate({
    body: z.object({
      messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().min(1).max(2000) })).min(1).max(40),
      petId: z.string().uuid().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { messages, petId } = req.body as { messages: { role: 'user' | 'assistant'; text: string }[]; petId?: string };
    const pet = petId
      ? await prisma.pet.findFirst({ where: { id: petId, ownerId: req.user!.id }, select: { name: true, species: true, breed: true } })
      : null;

    const { summary, source } = await extractChatSummary({ messages, pet });

    const saved = await prisma.chatSummary.create({
      data: {
        ownerId: req.user!.id,
        petId: pet ? petId! : null, // solo enlaza si la mascota es del dueño
        consultationReason: summary.consultation_reason,
        symptoms: summary.symptoms,
        durationOfSymptoms: summary.duration_of_symptoms,
        perceivedUrgency: summary.perceived_urgency_level,
        possibleTriggers: summary.possible_triggers,
        firstAidGiven: summary.first_aid_given,
        recommendedAction: summary.recommended_action,
        keyObservationsForVet: summary.key_observations_for_vet,
        source,
      },
    });
    res.status(201).json({ id: saved.id, source, summary });
  }),
);

// GET /me/pets/:id/chat-summaries -> historial de resúmenes de Migo AI de una mascota
router.get(
  '/pets/:id/chat-summaries',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const pet = await prisma.pet.findFirst({ where: { id: req.params.id, ownerId: req.user!.id }, select: { id: true } });
    if (!pet) throw ApiError.notFound('Mascota no encontrada');
    const data = await prisma.chatSummary.findMany({
      where: { ownerId: req.user!.id, petId: pet.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data });
  }),
);

// ─────────────────────────────────────────────────────────────────────
//  CHAT dueño ↔ clínica (persistido)
// ─────────────────────────────────────────────────────────────────────

// GET /me/chats -> lista de conversaciones (última por clínica)
router.get(
  '/chats',
  asyncHandler(async (req, res) => {
    const ownerId = req.user!.id;
    const msgs = await prisma.chatMessage.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' } });
    const last = new Map<string, (typeof msgs)[number]>();
    for (const m of msgs) if (!last.has(m.clinicId)) last.set(m.clinicId, m);
    const clinics = await prisma.clinic.findMany({
      where: { id: { in: [...last.keys()] } },
      select: { id: true, name: true, logoUrl: true },
    });
    const cmap = new Map(clinics.map((c) => [c.id, c]));
    const data = [...last.entries()]
      .map(([clinicId, m]) => ({
        clinicId,
        clinic: cmap.get(clinicId) ?? { id: clinicId, name: 'Clínica', logoUrl: null },
        lastMessage: m.text,
        lastSender: m.sender,
        lastAt: m.createdAt,
      }))
      .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
    res.json({ data });
  }),
);

// POST /me/chats/:clinicId/stream-channel -> asegura el canal de Stream Chat dueño↔clínica
router.post(
  '/chats/:clinicId/stream-channel',
  validate({ params: z.object({ clinicId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    if (!streamConfigured()) throw ApiError.badRequest('GetStream no está configurado en el servidor.');
    const clinic = await prisma.clinic.findFirst({
      where: { id: req.params.clinicId!, verificationStatus: 'VERIFIED' },
      select: { id: true, name: true, logoUrl: true },
    });
    if (!clinic) throw ApiError.notFound('Clínica no encontrada');
    const me = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, fullName: true, avatarUrl: true },
    });
    const channel = await ensureChatChannel({
      owner: { id: me!.id, name: me!.fullName, image: me!.avatarUrl },
      clinic,
    });
    res.json({ channel, clinic });
  }),
);

// GET /me/chats/:clinicId -> hilo con una clínica (crea saludo si está vacío)
router.get(
  '/chats/:clinicId',
  validate({ params: z.object({ clinicId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const ownerId = req.user!.id;
    const clinicId = req.params.clinicId!;
    const clinic = await prisma.clinic.findFirst({
      where: { id: clinicId, verificationStatus: 'VERIFIED' },
      select: { id: true, name: true, logoUrl: true, phone: true, address: true, city: true },
    });
    if (!clinic) throw ApiError.notFound('Clínica no encontrada');

    let messages = await prisma.chatMessage.findMany({ where: { ownerId, clinicId }, orderBy: { createdAt: 'asc' } });
    if (messages.length === 0) {
      const welcome = await prisma.chatMessage.create({
        data: { ownerId, clinicId, sender: 'CLINIC', text: `¡Hola! 👋 Bienvenido al chat de ${clinic.name}. ¿En qué podemos ayudarte con tu mascota?` },
      });
      messages = [welcome];
    }
    res.json({ clinic, messages });
  }),
);

// POST /me/chats/:clinicId/messages -> el dueño envía un mensaje (+ auto-respuesta demo de la clínica)
router.post(
  '/chats/:clinicId/messages',
  validate({
    params: z.object({ clinicId: z.string().uuid() }),
    body: z.object({ text: z.string().min(1).max(1000) }),
  }),
  asyncHandler(async (req, res) => {
    const ownerId = req.user!.id;
    const clinicId = req.params.clinicId!;
    const clinic = await prisma.clinic.findFirst({
      where: { id: clinicId, verificationStatus: 'VERIFIED' },
      select: { id: true, name: true },
    });
    if (!clinic) throw ApiError.notFound('Clínica no encontrada');

    const ownerMsg = await prisma.chatMessage.create({
      data: { ownerId, clinicId, sender: 'OWNER', text: req.body.text },
    });
    // La clínica responde de verdad desde el Vet Dashboard (el cliente sondea el hilo)
    res.status(201).json({ messages: [ownerMsg] });
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
