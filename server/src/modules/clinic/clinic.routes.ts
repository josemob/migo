import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate, requireRole } from '../../middleware/auth';
import { withClinicContext } from '../../middleware/clinicContext';
import { ApiError } from '../../utils/ApiError';
import { randomUUID } from 'node:crypto';
import { createStreamCredentials, streamConfigured, clinicStreamUserId, createRingingCall } from '../stream/stream.service';

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

// Inicio del PRÓXIMO día en hora de Venezuela (UTC-4), como instante UTC.
function startOfNextVenezuelaDay(): Date {
  const OFFSET_MS = 4 * 60 * 60 * 1000; // VE = UTC-4
  const ve = new Date(Date.now() - OFFSET_MS); // ahora, con campos UTC = hora VE
  const veMidnightNext = Date.UTC(ve.getUTCFullYear(), ve.getUTCMonth(), ve.getUTCDate() + 1, 0, 0, 0, 0);
  return new Date(veMidnightNext + OFFSET_MS); // vuelve a UTC real
}

// PATCH /clinic/availability -> cierre manual temporal (override del horario).
// available=false: la clínica queda "no disponible" (Cerrado en el directorio) hasta
// el inicio del próximo día VE, cuando se restaura sola. available=true: reabrir ya.
router.patch(
  '/availability',
  requireRole('CLINIC_ADMIN', 'VET', 'SUPER_ADMIN'),
  validate({ body: z.object({ available: z.boolean() }) }),
  asyncHandler(async (req, res) => {
    const unavailable = req.body.available === false;
    const clinic = await prisma.clinic.update({
      where: { id: req.clinicId! },
      data: {
        manuallyUnavailable: unavailable,
        unavailableUntil: unavailable ? startOfNextVenezuelaDay() : null,
      },
      select: { id: true, manuallyUnavailable: true, unavailableUntil: true },
    });
    res.json(clinic);
  }),
);

// PATCH /clinic/organization -> "Datos Legales del Comercio" (razón social + RIF, auditado por Super Admin)
// RIF venezolano: letra fiscal (J/G/V/E/P) + dígitos, ej. J-40123456-7
const RIF_RE = /^[VEJPGvejpg]-?\d{7,9}-?\d?$/;
const orgSchema = z.object({
  legalName: z.string().min(2, 'Razón social muy corta').optional(),
  rif: z.string().regex(RIF_RE, 'RIF inválido. Formato esperado: J-40123456-7').optional(),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
});

router.patch(
  '/organization',
  requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validate({ body: orgSchema }),
  asyncHandler(async (req, res) => {
    const clinic = await prisma.clinic.findUnique({
      where: { id: req.clinicId! },
      select: { organizationId: true },
    });
    if (!clinic) throw ApiError.notFound('Sucursal no encontrada');

    const { email, rif, ...rest } = req.body as { email?: string; rif?: string; [k: string]: unknown };
    const data: Record<string, unknown> = { ...rest };
    if (email !== undefined) data.email = email === '' ? null : email;
    if (rif !== undefined) data.rif = rif.toUpperCase();

    try {
      const org = await prisma.organization.update({ where: { id: clinic.organizationId }, data });
      res.json(org);
    } catch (e) {
      if (e && typeof e === 'object' && (e as { code?: string }).code === 'P2002') {
        throw ApiError.conflict('Ese RIF ya está registrado por otro comercio.');
      }
      throw e;
    }
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

// GET /clinic/stream-token -> credenciales de GetStream con la IDENTIDAD DE LA CLÍNICA
// (todo el staff opera el chat/llamadas bajo la marca de la sucursal ante el cliente)
router.get(
  '/stream-token',
  asyncHandler(async (req, res) => {
    if (!streamConfigured()) throw ApiError.badRequest('GetStream no está configurado en el servidor.');
    const clinic = await prisma.clinic.findUnique({
      where: { id: req.clinicId! },
      select: { id: true, name: true, logoUrl: true },
    });
    if (!clinic) throw ApiError.notFound('Sucursal no encontrada');
    const cred = await createStreamCredentials({
      id: clinicStreamUserId(clinic.id),
      name: clinic.name,
      image: clinic.logoUrl,
      migoRole: 'vet',
    });
    res.json({ ...cred, clinicUserId: clinicStreamUserId(clinic.id) });
  }),
);

// POST /clinic/teleconsults -> SOLO la clínica inicia una llamada: crea la sala y "anilla" al dueño
router.post(
  '/teleconsults',
  requireRole('CLINIC_ADMIN', 'VET', 'SUPER_ADMIN'),
  validate({ body: z.object({ ownerId: z.string().uuid(), video: z.boolean().default(true) }) }),
  asyncHandler(async (req, res) => {
    if (!streamConfigured()) throw ApiError.badRequest('GetStream no está configurado en el servidor.');
    const clinic = await prisma.clinic.findUnique({
      where: { id: req.clinicId! },
      select: { id: true, name: true, logoUrl: true },
    });
    if (!clinic) throw ApiError.notFound('Sucursal no encontrada');
    const owner = await prisma.user.findUnique({ where: { id: req.body.ownerId }, select: { id: true } });
    if (!owner) throw ApiError.notFound('Cliente no encontrado');

    const callId = randomUUID();
    const call = await createRingingCall({ callId, clinic, ownerId: owner.id, video: req.body.video });
    res.status(201).json(call);
  }),
);

// ─────────────────────────────────────────────────────────────────────
//  CHAT clínica ↔ dueños (el Vet Dashboard responde a los clientes)
// ─────────────────────────────────────────────────────────────────────

// GET /clinic/chats -> conversaciones (dueños que han escrito a esta sucursal)
router.get(
  '/chats',
  asyncHandler(async (req, res) => {
    const clinicId = req.clinicId!;
    const msgs = await prisma.chatMessage.findMany({ where: { clinicId }, orderBy: { createdAt: 'desc' } });
    const last = new Map<string, (typeof msgs)[number]>();
    for (const m of msgs) if (!last.has(m.ownerId)) last.set(m.ownerId, m);
    const owners = await prisma.user.findMany({
      where: { id: { in: [...last.keys()] } },
      select: { id: true, fullName: true, avatarUrl: true, phone: true },
    });
    const omap = new Map(owners.map((o) => [o.id, o]));
    const data = [...last.entries()]
      .map(([ownerId, m]) => ({
        ownerId,
        owner: omap.get(ownerId) ?? { id: ownerId, fullName: 'Cliente', avatarUrl: null, phone: null },
        lastMessage: m.text,
        lastSender: m.sender,
        lastAt: m.createdAt,
      }))
      .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
    res.json({ data });
  }),
);

// GET /clinic/chats/:ownerId -> hilo con un dueño (+ sus mascotas como contexto)
router.get(
  '/chats/:ownerId',
  validate({ params: z.object({ ownerId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const clinicId = req.clinicId!;
    const ownerId = req.params.ownerId!;
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, fullName: true, avatarUrl: true, phone: true },
    });
    if (!owner) throw ApiError.notFound('Cliente no encontrado');
    const [messages, pets] = await Promise.all([
      prisma.chatMessage.findMany({ where: { ownerId, clinicId }, orderBy: { createdAt: 'asc' } }),
      prisma.pet.findMany({ where: { ownerId }, select: { name: true, species: true, breed: true } }),
    ]);
    res.json({ owner, pets, messages });
  }),
);

// POST /clinic/chats/:ownerId/messages -> la clínica responde al dueño
router.post(
  '/chats/:ownerId/messages',
  validate({
    params: z.object({ ownerId: z.string().uuid() }),
    body: z.object({ text: z.string().min(1).max(1000) }),
  }),
  asyncHandler(async (req, res) => {
    const clinicId = req.clinicId!;
    const ownerId = req.params.ownerId!;
    const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
    if (!owner) throw ApiError.notFound('Cliente no encontrado');
    const msg = await prisma.chatMessage.create({ data: { ownerId, clinicId, sender: 'CLINIC', text: req.body.text } });
    res.status(201).json(msg);
  }),
);

export default router;
