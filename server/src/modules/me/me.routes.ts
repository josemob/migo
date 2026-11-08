import { Router } from 'express';
import { randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { newPublicCode } from '../../utils/publicCode';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { ApiError } from '../../utils/ApiError';
import { migoAiReply } from '../chat/aiChat.service';
import { extractChatSummary } from '../chat/chatSummary.service';
import { createStreamCredentials, streamConfigured, ensureChatChannel, createIndependentRingingCall } from '../stream/stream.service';
import { registerPushToken, removePushToken, sendPush } from '../push/push.service';
import { issueReceipt, receiptNumber } from '../receipts/receipt.service';
import { emergencyService } from '../emergencies/emergency.service';
import { listPlans, selectPlanForVet, defaultPlan } from '../plans/plan.service';
import { hashPassword, verifyPassword } from '../../utils/password';
import { hashToken } from '../../utils/jwt';
import { sendEmailChangeCodeEmail, sendEmailChangedNoticeEmail } from '../mail/mail.service';

const router = Router();
router.use(authenticate);

const SPECIES = ['DOG', 'CAT', 'BIRD', 'RABBIT', 'REPTILE', 'RODENT', 'OTHER'] as const;

// GET /me/plan -> plan del profesional independiente: actual (efectivo), pendiente de
// pago y catálogo disponible. El vet elige su plan desde su app (sin cobro aún).
router.get('/plan', asyncHandler(async (req, res) => {
  const sub = await prisma.vetSubscription.findUnique({ where: { userId: req.user!.id } });
  if (!sub) throw ApiError.forbidden('Solo un profesional con perfil puede ver planes.');
  const available = await listPlans('VET');
  const fallback = await defaultPlan('VET');
  const currentId = sub.planId ?? fallback?.id ?? null;
  const current = available.find((p) => p.id === currentId) ?? null;
  const pending = sub.pendingPlanId ? available.find((p) => p.id === sub.pendingPlanId) ?? null : null;
  res.json({ current, pending, available });
}));

// POST /me/plan/select -> el vet elige un plan. Gratis => se aplica; de pago => queda
// pendiente de pago (pendingPlanId) hasta que exista la pasarela.
router.post('/plan/select',
  validate({ body: z.object({ planId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const sub = await prisma.vetSubscription.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
    if (!sub) throw ApiError.forbidden('Solo un profesional con perfil puede elegir plan.');
    const r = await selectPlanForVet(req.user!.id, req.body.planId);
    if (!r.ok) throw ApiError.badRequest(r.reason);
    res.json({ ok: true, applied: r.applied });
  }));

// GET /me/banner -> banner patrocinado del dashboard (controlado desde Super Admin).
// Devuelve la imagen solo si está encendido; si no, enabled:false y sin arte.
router.get(
  '/banner',
  asyncHandler(async (_req, res) => {
    const cfg = await prisma.platformConfig.findUnique({
      where: { id: 'singleton' },
      select: { clientBannerEnabled: true, clientBannerImage: true },
    });
    const enabled = !!(cfg?.clientBannerEnabled && cfg.clientBannerImage);
    res.json({ enabled, image: enabled ? cfg!.clientBannerImage : null });
  }),
);

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

// POST /me/email/request -> pide cambiar el correo: envía un código de 6 dígitos al correo
// NUEVO (prueba que es suyo). El cambio solo se aplica al confirmar el código.
router.post(
  '/email/request',
  validate({ body: z.object({ newEmail: z.string().trim().toLowerCase().email().max(120) }) }),
  asyncHandler(async (req, res) => {
    const { newEmail } = req.body as { newEmail: string };
    const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, email: true, fullName: true } });
    if (!me) throw ApiError.notFound('Usuario no encontrado');
    if (me.email.toLowerCase() === newEmail) throw ApiError.badRequest('Ese ya es tu correo actual.');
    const taken = await prisma.user.findFirst({ where: { email: { equals: newEmail, mode: 'insensitive' } }, select: { id: true } });
    if (taken) throw ApiError.conflict('Ese correo ya está registrado en otra cuenta.');

    // Solo un código vivo por usuario
    await prisma.emailChangeCode.updateMany({ where: { userId: me.id, usedAt: null }, data: { usedAt: new Date() } });
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await prisma.emailChangeCode.create({
      data: { userId: me.id, newEmail, codeHash: hashToken(code), expiresAt: new Date(Date.now() + 15 * 60_000) },
    });
    const sent = await sendEmailChangeCodeEmail(newEmail, me.fullName, code);
    if (!sent) throw ApiError.badRequest('No pudimos enviar el código a ese correo. Intenta más tarde.');
    res.status(204).end();
  }),
);

// POST /me/email/confirm -> confirma el código y aplica el correo nuevo. Avisa al anterior.
router.post(
  '/email/confirm',
  validate({ body: z.object({ code: z.string().trim().length(6) }) }),
  asyncHandler(async (req, res) => {
    const rec = await prisma.emailChangeCode.findFirst({
      where: { userId: req.user!.id, usedAt: null, expiresAt: { gt: new Date() }, codeHash: hashToken(req.body.code) },
      orderBy: { createdAt: 'desc' },
    });
    if (!rec) throw ApiError.badRequest('Código inválido o vencido');
    const taken = await prisma.user.findFirst({
      where: { email: { equals: rec.newEmail, mode: 'insensitive' }, id: { not: req.user!.id } },
      select: { id: true },
    });
    if (taken) throw ApiError.conflict('Ese correo ya está registrado en otra cuenta.');

    const before = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { email: true, fullName: true } });
    const [user] = await prisma.$transaction([
      prisma.user.update({
        where: { id: req.user!.id },
        data: { email: rec.newEmail },
        select: { id: true, email: true, fullName: true, phone: true, avatarUrl: true, role: true },
      }),
      prisma.emailChangeCode.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
    ]);
    if (before) void sendEmailChangedNoticeEmail(before.email, before.fullName, rec.newEmail).catch(() => {});
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
        vaccinations: { orderBy: { appliedAt: 'desc' }, include: { clinic: { select: { name: true } } } },
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

// ─── Placa QR de identificación ──────────────────────────────────────────────
const tagSelect = {
  id: true, name: true, publicCode: true,
  lostMode: true, lostSince: true, lostMessage: true, showOwnerPhone: true,
} as const;

const tagView = (pet: Prisma.PetGetPayload<{ select: typeof tagSelect }>) => ({
  name: pet.name,
  code: pet.publicCode,
  // La URL que va dentro del QR. Corta a propósito: menos módulos en el QR,
  // y cuanto más grandes los módulos, mejor escanea en una placa de 25 mm.
  url: pet.publicCode ? `${env.APP_PUBLIC_URL}/m/${pet.publicCode}` : null,
  lostMode: pet.lostMode,
  lostSince: pet.lostSince,
  lostMessage: pet.lostMessage,
  showOwnerPhone: pet.showOwnerPhone,
});

// POST /me/pets/:id/tag -> asegura el código de la placa y devuelve su URL pública.
// Idempotente: si ya tiene código devuelve el mismo, porque la placa ya impresa
// no puede cambiar. El código se crea aquí y no al registrar la mascota.
router.post(
  '/pets/:id/tag',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    let pet = await prisma.pet.findFirst({ where: { id: req.params.id, ownerId: req.user!.id }, select: tagSelect });
    if (!pet) throw ApiError.notFound('Mascota no encontrada');

    // Colisión improbable (~594M códigos), pero posible: reintenta con otro.
    for (let attempt = 0; !pet.publicCode && attempt < 5; attempt++) {
      try {
        pet = await prisma.pet.update({ where: { id: pet.id }, data: { publicCode: newPublicCode() }, select: tagSelect });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
    if (!pet.publicCode) throw new ApiError(500, 'No se pudo generar el código de la placa. Intenta de nuevo.');

    res.json(tagView(pet));
  }),
);

// PATCH /me/pets/:id/lost -> activar o desactivar el modo extraviado
router.patch(
  '/pets/:id/lost',
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      lostMode: z.boolean(),
      lostMessage: z.string().trim().max(300).nullable().optional(),
      showOwnerPhone: z.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.pet.findFirst({
      where: { id: req.params.id, ownerId: req.user!.id },
      select: { id: true, lostMode: true, lostSince: true },
    });
    if (!existing) throw ApiError.notFound('Mascota no encontrada');

    const { lostMode, lostMessage, showOwnerPhone } = req.body as {
      lostMode: boolean; lostMessage?: string | null; showOwnerPhone?: boolean;
    };

    const pet = await prisma.pet.update({
      where: { id: existing.id },
      data: lostMode
        ? {
            lostMode: true,
            // Si ya estaba extraviada, conserva la fecha original al editar el mensaje.
            lostSince: existing.lostMode && existing.lostSince ? existing.lostSince : new Date(),
            ...(lostMessage !== undefined && { lostMessage: lostMessage || null }),
            ...(showOwnerPhone !== undefined && { showOwnerPhone }),
          }
        : // Al volver a casa se borra todo lo del extravío y el teléfono vuelve a
          // ocultarse: la próxima vez el dueño decide de nuevo si lo muestra.
          { lostMode: false, lostSince: null, lostMessage: null, showOwnerPhone: false },
      select: tagSelect,
    });
    res.json(tagView(pet));
  }),
);

// GET /me/pets/:id/found-reports -> avisos de quienes la encontraron (y los marca vistos)
router.get(
  '/pets/:id/found-reports',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const pet = await prisma.pet.findFirst({ where: { id: req.params.id, ownerId: req.user!.id }, select: { id: true } });
    if (!pet) throw ApiError.notFound('Mascota no encontrada');

    const reports = await prisma.petFoundReport.findMany({
      where: { petId: pet.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    await prisma.petFoundReport.updateMany({ where: { petId: pet.id, seenAt: null }, data: { seenAt: new Date() } });
    res.json({ data: reports });
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

    // 5) El horario no puede estar ya aceptado por la clínica para otra cita.
    const taken = await prisma.appointment.findFirst({
      where: { clinicId, scheduledAt, status: { in: ['CONFIRMED', 'IN_PROGRESS'] } },
      select: { id: true },
    });
    if (taken) throw ApiError.conflict('Ese horario ya no está disponible. Elige otro.');

    // La cita nace como SOLICITUD (PENDING): el equipo de la clínica la acepta o la rechaza.
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

    // Pago en la app -> emite recibo al dueño (comprobante + correo), sin bloquear
    if (paid && priceUsd != null) {
      void issueReceipt({
        clinicId,
        ownerId: req.user!.id,
        petId,
        appointmentId: appt.id,
        concept: derivedReason ?? 'Servicio veterinario',
        amountUsd: priceUsd,
        source: 'APP',
      }).catch(() => {});
    }

    // Notifica por push a TODO el equipo de la clínica: cualquiera puede aceptar la solicitud.
    try {
      const staff = await prisma.clinicStaff.findMany({ where: { clinicId, isActive: true }, select: { userId: true } });
      const targets = [...new Set(staff.map((s) => s.userId))];
      if (targets.length) {
        const fecha = new Intl.DateTimeFormat('es-VE', {
          weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Caracas',
        }).format(scheduledAt);
        const title = '🗓️ Nueva solicitud de cita';
        const body = `${appt.pet.name} · ${derivedReason ?? 'Consulta'} · ${fecha} — acéptala o recházala`;
        await Promise.all(targets.map((userId) => sendPush(userId, { title, body, data: { type: 'appointment-request', appointmentId: appt.id } })));
      }
    } catch (e) {
      console.error('[appointments] push a la clínica falló', e);
    }

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

// GET /me/appointments/:id -> detalle de una cita del dueño ("Ver Cita" en el calendario).
// Va después de /appointments/next y /pending-review para no capturar esas rutas.
router.get(
  '/appointments/:id',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const appointment = await prisma.appointment.findFirst({
      where: { id: req.params.id, bookedById: req.user!.id },
      include: {
        clinic: { select: { id: true, name: true, logoUrl: true, phone: true, address: true } },
        service: { select: { name: true, category: true } },
        pet: { select: { id: true, name: true, photoUrl: true } },
        vet: { select: { user: { select: { fullName: true } } } },
      },
    });
    if (!appointment) throw ApiError.notFound('Cita no encontrada');
    res.json({ appointment });
  }),
);

// POST /me/appointments/:id/cancel -> el dueño cancela su cita (solo pendientes/confirmadas
// y que no hayan empezado). Avisa por push al equipo de la clínica.
router.post(
  '/appointments/:id/cancel',
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ reason: z.string().trim().max(200).optional() }),
  }),
  asyncHandler(async (req, res) => {
    const appt = await prisma.appointment.findFirst({
      where: { id: req.params.id, bookedById: req.user!.id },
      include: { pet: { select: { name: true } } },
    });
    if (!appt) throw ApiError.notFound('Cita no encontrada');
    if (appt.status !== 'PENDING' && appt.status !== 'CONFIRMED') {
      throw ApiError.badRequest('Esta cita ya no se puede cancelar.');
    }

    const reason = (req.body as { reason?: string }).reason;
    const updated = await prisma.appointment.update({
      where: { id: appt.id },
      data: { status: 'CANCELLED', cancelReason: reason ? `Cancelada por el dueño: ${reason}` : 'Cancelada por el dueño' },
    });

    try {
      const staff = await prisma.clinicStaff.findMany({ where: { clinicId: appt.clinicId, isActive: true }, select: { userId: true } });
      const targets = [...new Set(staff.map((s) => s.userId))];
      const fecha = new Intl.DateTimeFormat('es-VE', {
        weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Caracas',
      }).format(appt.scheduledAt);
      const title = 'Cita cancelada por el dueño';
      const body = `${appt.pet.name} · ${appt.reason ?? 'Consulta'} · ${fecha}${appt.paidInApp ? ' · pagada en la app' : ''}`;
      await Promise.all(targets.map((userId) => sendPush(userId, { title, body, data: { type: 'appointment', appointmentId: appt.id } })));
    } catch (e) {
      console.error('[appointments] push de cancelación falló', e);
    }

    res.json({ appointment: updated });
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
        ? prisma.pet.findFirst({
            where: { id: petId, ownerId: req.user!.id },
            select: {
              name: true, species: true, breed: true, sex: true, birthDate: true,
              weightKg: true, isSterilized: true, specialCondition: true,
              allergies: { select: { substance: true } },
              conditions: { where: { isActive: true }, select: { name: true } },
            },
          })
        : Promise.resolve(null),
    ]);
    // Ficha enriquecida de la mascota seleccionada para una conversación personalizada.
    const petCtx = pet
      ? {
          name: pet.name, species: pet.species, breed: pet.breed, sex: pet.sex,
          birthDate: pet.birthDate, weightKg: pet.weightKg ? Number(pet.weightKg) : null,
          isSterilized: pet.isSterilized, specialCondition: pet.specialCondition,
          allergies: pet.allergies.map((a) => a.substance),
          conditions: pet.conditions.map((c) => c.name),
        }
      : null;
    const reply = await migoAiReply({ messages, pet: petCtx, ownerName: me?.fullName?.split(' ')[0] });
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

// POST /me/pets/:id/vaccinations -> el dueño anota en la cartilla una vacuna o
// desparasitación aplicada fuera de Migo. Queda marcada recordedByOwner (sin clínica).
router.post(
  '/pets/:id/vaccinations',
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z
      .object({
        kind: z.enum(['VACCINE', 'DEWORMING']).default('VACCINE'),
        vaccineName: z.string().trim().min(2).max(80),
        appliedAt: z.coerce.date(),
        nextDueAt: z.coerce.date().optional(),
        lotNumber: z.string().trim().max(40).optional(),
      })
      .refine((b) => b.appliedAt.getTime() <= Date.now() + 86_400_000, { message: 'La fecha de aplicación no puede ser futura', path: ['appliedAt'] })
      .refine((b) => !b.nextDueAt || b.nextDueAt > b.appliedAt, { message: 'La próxima dosis debe ser después de la aplicación', path: ['nextDueAt'] }),
  }),
  asyncHandler(async (req, res) => {
    const pet = await prisma.pet.findFirst({ where: { id: req.params.id, ownerId: req.user!.id } });
    if (!pet) throw ApiError.notFound('Mascota no encontrada');
    const vax = await prisma.vaccination.create({ data: { ...req.body, petId: pet.id, recordedByOwner: true } });
    res.status(201).json(vax);
  }),
);

// DELETE /me/pets/:id/vaccinations/:vaxId -> el dueño solo puede borrar las que él anotó;
// las que registró una clínica son parte del historial clínico.
router.delete(
  '/pets/:id/vaccinations/:vaxId',
  validate({ params: z.object({ id: z.string().uuid(), vaxId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const vax = await prisma.vaccination.findFirst({
      where: { id: req.params.vaxId, petId: req.params.id, pet: { ownerId: req.user!.id } },
    });
    if (!vax) throw ApiError.notFound('Registro no encontrado');
    if (!vax.recordedByOwner) throw ApiError.forbidden('Solo puedes borrar los registros que anotaste tú');
    await prisma.vaccination.delete({ where: { id: vax.id } });
    res.status(204).end();
  }),
);

// GET /me/receipts -> recibos/comprobantes del dueño
router.get(
  '/receipts',
  asyncHandler(async (req, res) => {
    const rows = await prisma.receipt.findMany({
      where: { ownerId: req.user!.id },
      orderBy: { issuedAt: 'desc' },
      include: { clinic: { select: { name: true } }, pet: { select: { name: true } } },
    });
    const data = rows.map((r) => ({
      id: r.id,
      number: receiptNumber(r.id),
      concept: r.concept,
      amountUsd: Number(r.amountUsd),
      source: r.source,
      paymentMethod: r.paymentMethod,
      issuedAt: r.issuedAt.toISOString(),
      clinicName: r.clinic?.name ?? null,
      petName: r.pet?.name ?? null,
    }));
    res.json({ data });
  }),
);

// GET /me/receipts/:id -> detalle de un recibo
router.get(
  '/receipts/:id',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const r = await prisma.receipt.findFirst({
      where: { id: req.params.id, ownerId: req.user!.id },
      include: { clinic: { select: { name: true, address: true } }, pet: { select: { name: true } } },
    });
    if (!r) throw ApiError.notFound('Recibo no encontrado');
    res.json({
      id: r.id,
      number: receiptNumber(r.id),
      concept: r.concept,
      amountUsd: Number(r.amountUsd),
      source: r.source,
      paymentMethod: r.paymentMethod,
      issuedAt: r.issuedAt.toISOString(),
      clinicName: r.clinic?.name ?? null,
      clinicAddress: r.clinic?.address ?? null,
      petName: r.pet?.name ?? null,
    });
  }),
);

// GET /me/records/:id -> detalle de una consulta del expediente (del dueño)
router.get(
  '/records/:id',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const r = await prisma.medicalRecord.findFirst({
      where: { id: req.params.id, pet: { ownerId: req.user!.id } },
      include: {
        pet: { select: { name: true, breed: true } },
        clinic: { select: { name: true } },
        vet: { include: { user: { select: { fullName: true } } } },
        prescriptions: true,
      },
    });
    if (!r) throw ApiError.notFound('Consulta no encontrada');
    res.json({
      id: r.id,
      visitedAt: r.visitedAt.toISOString(),
      reason: r.reason,
      symptoms: r.symptoms,
      diagnosis: r.diagnosis,
      treatment: r.treatment,
      notes: r.notes,
      weightKg: r.weightKg != null ? Number(r.weightKg) : null,
      temperature: r.temperature != null ? Number(r.temperature) : null,
      signedAt: r.signedAt ? r.signedAt.toISOString() : null,
      // Prioriza el snapshot de la firma (persiste aunque el vet ya no esté en la clínica)
      vetName: r.signedByName ?? r.vet?.user?.fullName ?? null,
      vetSpecialty: r.signedBySpecialty ?? r.vet?.specialty ?? null,
      vetLicense: r.signedByLicense ?? r.vet?.collegiateNumber ?? null,
      clinicName: r.clinic?.name ?? null,
      petName: r.pet?.name ?? null,
      petBreed: r.pet?.breed ?? null,
      prescriptions: r.prescriptions.map((pr) => ({
        drug: pr.drug,
        dose: pr.dose,
        frequency: pr.frequency,
        durationDays: pr.durationDays,
        instructions: pr.instructions,
      })),
    });
  }),
);

// GET /me/vet-profile -> perfil profesional (independiente de clínica) + estado telemedicina
router.get(
  '/vet-profile',
  asyncHandler(async (req, res) => {
    const [profile, sub, staff] = await Promise.all([
      prisma.vetProfile.findUnique({ where: { userId: req.user!.id } }),
      prisma.vetSubscription.findUnique({ where: { userId: req.user!.id } }),
      prisma.clinicStaff.findUnique({ where: { userId: req.user!.id }, select: { clinicId: true, clinic: { select: { name: true } } } }),
    ]);
    if (!profile) return res.json({ profile: null, isIndependent: false, hasClinic: !!staff });
    const verified = profile.verificationStatus === 'VERIFIED';
    const hasClinic = !!staff;
    // Solicitud de cambio de especialidad pendiente (bloquea la edición hasta que el admin resuelva)
    const pending = await prisma.vetSpecialtyRequest.findFirst({
      where: { vetProfileId: profile.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: { requestedSpecialty: true, createdAt: true },
    });
    res.json({
      profile: {
        position: profile.position,
        specialty: profile.specialty,
        collegiateNumber: profile.collegiateNumber,
        experienceYears: profile.experienceYears,
        verificationStatus: profile.verificationStatus,
        serviceLat: profile.serviceLat != null ? Number(profile.serviceLat) : null,
        serviceLng: profile.serviceLng != null ? Number(profile.serviceLng) : null,
        serviceRadiusKm: profile.serviceRadiusKm,
        ratingAvg: Number(profile.ratingAvg),
        ratingCount: profile.ratingCount,
      },
      subscription: sub ? { plan: sub.plan, status: sub.status } : null,
      isIndependent: verified && !hasClinic, // verificado y sin clínica = vet independiente
      hasClinic,
      clinicName: staff?.clinic?.name ?? null,
      telemedicineActive: verified && !hasClinic && sub?.status === 'ACTIVE',
      pendingSpecialty: pending?.requestedSpecialty ?? null, // hay cambio en revisión
    });
  }),
);

// PATCH /me/vet-profile -> el profesional actualiza su experiencia y ubicación de servicio.
// La ESPECIALIDAD ya no se edita aquí: va por /me/specialty-request (requiere documentos + aprobación).
router.patch(
  '/vet-profile',
  validate({
    body: z.object({
      experienceYears: z.number().int().min(0).max(80).nullable().optional(),
      serviceLat: z.number().optional(),
      serviceLng: z.number().optional(),
      serviceRadiusKm: z.number().int().min(1).max(200).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const updated = await prisma.vetProfile.update({ where: { userId: req.user!.id }, data: req.body }).catch(() => null);
    if (!updated) throw ApiError.notFound('Aún no tienes perfil profesional. Completa tu verificación (KYC) primero.');
    res.json({ ok: true });
  }),
);

// POST /me/specialty-request -> el vet solicita cambiar sus especialidades, avalado con
// documentos (carnet, postgrado, etc.). Queda PENDING hasta que el Super Admin lo apruebe.
router.post(
  '/specialty-request',
  validate({
    body: z.object({
      specialty: z.string().min(2).max(200), // hasta 3 especialidades separadas por coma
      documents: z
        .array(
          z.object({
            type: z.string().min(1).max(40), // Carnet CMV | Postgrado | Diplomado | Otro
            label: z.string().max(120).optional(),
            url: z.string().min(1), // data URI (imagen o PDF)
          }),
        )
        .min(1, 'Adjunta al menos un documento que avale tu especialidad'),
    }),
  }),
  asyncHandler(async (req, res) => {
    const profile = await prisma.vetProfile.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
    if (!profile) throw ApiError.notFound('Aún no tienes perfil profesional. Completa tu verificación (KYC) primero.');
    const existing = await prisma.vetSpecialtyRequest.findFirst({ where: { vetProfileId: profile.id, status: 'PENDING' } });
    if (existing) throw ApiError.conflict('Ya tienes una solicitud de especialidad en revisión.');
    const created = await prisma.vetSpecialtyRequest.create({
      data: {
        vetProfileId: profile.id,
        requestedSpecialty: req.body.specialty,
        documents: req.body.documents,
        status: 'PENDING',
      },
      select: { id: true, status: true, createdAt: true },
    });
    res.status(201).json(created);
  }),
);

// Gate de telemedicina para el vet INDEPENDIENTE: verificado, sin clínica y con
// suscripción ACTIVE. Devuelve el perfil o lanza 403 con un mensaje claro.
async function requireIndependentTelemedicine(userId: string) {
  const [profile, sub, staff] = await Promise.all([
    prisma.vetProfile.findUnique({ where: { userId } }),
    prisma.vetSubscription.findUnique({ where: { userId } }),
    prisma.clinicStaff.findUnique({ where: { userId }, select: { id: true } }),
  ]);
  if (!profile || profile.verificationStatus !== 'VERIFIED') {
    throw ApiError.forbidden('Tu perfil profesional aún no está verificado.');
  }
  if (staff) {
    throw ApiError.forbidden('Perteneces a una clínica; la teleconsulta se gestiona desde la clínica.');
  }
  if (!sub || sub.status !== 'ACTIVE') {
    throw ApiError.forbidden('Necesitas una suscripción de telemedicina activa.');
  }
  return profile;
}

// GET /me/teleconsults -> historial de teleconsultas atendidas como vet independiente
router.get(
  '/teleconsults',
  asyncHandler(async (req, res) => {
    const profile = await prisma.vetProfile.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
    if (!profile) return res.json({ data: [] });
    const rows = await prisma.teleconsult.findMany({
      where: { vetProfileId: profile.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { owner: { select: { fullName: true } }, pet: { select: { name: true } } },
    });
    res.json({
      data: rows.map((t) => ({
        id: t.id,
        status: t.status,
        createdAt: t.createdAt,
        scheduledAt: t.scheduledAt,
        ownerName: t.owner?.fullName ?? null,
        petName: t.pet?.name ?? null,
        reason: t.notes ?? null,
      })),
    });
  }),
);

// POST /me/teleconsults -> el vet independiente inicia una teleconsulta (persiste la sala).
// El video (Stream) se conecta en una fase posterior usando `agoraChannel`.
router.post(
  '/teleconsults',
  validate({
    body: z.object({
      ownerId: z.string().uuid(),
      petId: z.string().uuid().optional(),
      reason: z.string().max(500).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const profile = await requireIndependentTelemedicine(req.user!.id);
    const { ownerId, petId, reason } = req.body as { ownerId: string; petId?: string; reason?: string };

    const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
    if (!owner) throw ApiError.notFound('Dueño no encontrado.');
    if (petId) {
      const pet = await prisma.pet.findFirst({ where: { id: petId, ownerId }, select: { id: true } });
      if (!pet) throw ApiError.badRequest('La mascota no pertenece a ese dueño.');
    }

    const tele = await prisma.teleconsult.create({
      data: {
        ownerId,
        petId: petId ?? null,
        vetProfileId: profile.id,
        type: 'PAY_PER_EVENT',
        status: 'SCHEDULED',
        agoraChannel: randomUUID(),
        notes: reason ?? null,
      },
      select: { id: true, status: true, agoraChannel: true, createdAt: true },
    });
    res.status(201).json(tele);
  }),
);

// GET /me/notification-prefs -> preferencias de notificación del usuario
router.get(
  '/notification-prefs',
  asyncHandler(async (req, res) => {
    const u = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { notifyPush: true, notifyEmail: true, notifyWhatsapp: true },
    });
    res.json({ push: u?.notifyPush ?? true, email: u?.notifyEmail ?? true, whatsapp: u?.notifyWhatsapp ?? true });
  }),
);

// PATCH /me/notification-prefs -> actualizar preferencias (push/email/whatsapp)
router.patch(
  '/notification-prefs',
  validate({ body: z.object({ push: z.boolean().optional(), email: z.boolean().optional(), whatsapp: z.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    const { push, email, whatsapp } = req.body as { push?: boolean; email?: boolean; whatsapp?: boolean };
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { notifyPush: push, notifyEmail: email, notifyWhatsapp: whatsapp },
    });
    res.json({ ok: true });
  }),
);

// POST /me/delete-account -> el usuario elimina su cuenta (borrado suave + anonimización)
router.post(
  '/delete-account',
  validate({ body: z.object({ password: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, passwordHash: true } });
    if (!user) throw ApiError.notFound('Usuario no encontrado');
    if (!(await verifyPassword(req.body.password, user.passwordHash))) {
      throw ApiError.badRequest('Contraseña incorrecta');
    }
    // Anonimiza los datos personales y libera email/teléfono/cédula (constraints únicos).
    const deadHash = await hashPassword(randomUUID() + randomUUID());
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          status: 'DELETED',
          email: `deleted_${user.id}@deleted.migo`,
          phone: null,
          nationalId: null,
          fullName: 'Cuenta eliminada',
          avatarUrl: null,
          passwordHash: deadHash,
        },
      }),
      prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.pushToken.deleteMany({ where: { userId: user.id } }),
    ]);
    res.json({ ok: true });
  }),
);

// GET /me/emergencies -> urgencias ruteadas a este vet independiente (Fase C)
router.get(
  '/emergencies',
  asyncHandler(async (req, res) => {
    res.json({ data: await emergencyService.listIncomingForVet(req.user!.id) });
  }),
);

// POST /me/emergencies/alerts/:alertId/accept -> el vet independiente acepta la urgencia
router.post(
  '/emergencies/alerts/:alertId/accept',
  validate({ params: z.object({ alertId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    res.json(await emergencyService.acceptByVet(req.user!.id, req.params.alertId!));
  }),
);

// POST /me/emergencies/:emergencyId/call -> el vet independiente "anilla" al dueño (videollamada)
// La llamada se crea a nombre del vet en el servidor, así aparece en su overlay (useCalls).
router.post(
  '/emergencies/:emergencyId/call',
  validate({ params: z.object({ emergencyId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    if (!streamConfigured()) throw ApiError.badRequest('GetStream no está configurado en el servidor.');
    const profile = await prisma.vetProfile.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });
    if (!profile) throw ApiError.forbidden('Solo un vet independiente puede iniciar la videollamada.');
    const emergency = await prisma.emergency.findFirst({
      where: { id: req.params.emergencyId, acceptedVetProfileId: profile.id },
      select: { ownerId: true },
    });
    if (!emergency) throw ApiError.notFound('Urgencia no encontrada o no aceptada por ti.');
    const me = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { fullName: true, avatarUrl: true },
    });
    const callId = randomUUID();
    const call = await createIndependentRingingCall({
      callId,
      vet: { id: req.user!.id, name: me?.fullName, avatarUrl: me?.avatarUrl },
      ownerId: emergency.ownerId,
      video: true,
    });
    res.status(201).json(call);
  }),
);

export default router;
