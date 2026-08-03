import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { withClinicContext } from '../../middleware/clinicContext';
import { ApiError } from '../../utils/ApiError';
import { env } from '../../config/env';
import { verifyAccessToken } from '../../utils/jwt';
import { bus, EMERGENCY_NEW, EMERGENCY_UPDATE, type EmergencyEvent } from '../../lib/events';
import { emergencyService } from './emergency.service';

const router = Router();

// ─── SSE: stream de urgencias en tiempo real (ANTES del authenticate por header) ───
// EventSource no puede mandar Authorization, así que el token va en la query.
router.get(
  '/stream',
  asyncHandler(async (req, res) => {
    const token = req.query.token as string | undefined;
    if (!token) return res.status(401).end();
    let userId: string;
    try {
      userId = verifyAccessToken(token).sub;
    } catch {
      return res.status(401).end();
    }
    const staff = await prisma.clinicStaff.findUnique({
      where: { userId },
      select: { clinicId: true, isActive: true },
    });
    if (!staff?.isActive) return res.status(403).end();
    const clinicId = staff.clinicId;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // evita buffering en proxies
    res.flushHeaders();
    res.write('retry: 5000\n\n'); // reconexión del cliente a 5s
    res.write('event: connected\ndata: {}\n\n');

    const onEmergency = (evt: EmergencyEvent) => {
      if (evt.clinicId === clinicId) {
        res.write(`event: emergency\ndata: ${JSON.stringify({ emergencyId: evt.emergencyId })}\n\n`);
      }
    };
    // Actualización sin alarma (p. ej. cancelada por el dueño) -> refrescar panel
    const onUpdate = (evt: EmergencyEvent) => {
      if (evt.clinicId === clinicId) {
        res.write(`event: refresh\ndata: ${JSON.stringify({ emergencyId: evt.emergencyId })}\n\n`);
      }
    };
    bus.on(EMERGENCY_NEW, onEmergency);
    bus.on(EMERGENCY_UPDATE, onUpdate);

    // heartbeat para mantener viva la conexión (proxies/Cloud Run)
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      bus.off(EMERGENCY_NEW, onEmergency);
      bus.off(EMERGENCY_UPDATE, onUpdate);
      res.end();
    });
  }),
);

router.use(authenticate);

// ═══════════════════════════════════════════════════════════════
//  LADO DUEÑO (App Cliente) — botón de pánico y rastreo
// ═══════════════════════════════════════════════════════════════

// POST /emergencies -> botón de pánico: crea + triaje IA + broadcast
router.post(
  '/',
  validate({
    body: z.object({
      petId: z.string().uuid(),
      symptoms: z.string().min(3),
      photoUrls: z.array(z.string().url()).optional(),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await emergencyService.create(req.user!.id, req.body);
    res.status(201).json(result);
  }),
);

// GET /emergencies/mine -> urgencias del dueño
router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    res.json({ data: await emergencyService.listForOwner(req.user!.id) });
  }),
);

// GET /emergencies/:id/track -> seguimiento de la urgencia por el dueño
router.get(
  '/:id/track',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    res.json(await emergencyService.getForOwner(req.user!.id, req.params.id!));
  }),
);

// POST /emergencies/:id/cancel -> el dueño cancela antes de ser atendida
router.post(
  '/:id/cancel',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    res.json(await emergencyService.cancelByOwner(req.user!.id, req.params.id!));
  }),
);

// ═══════════════════════════════════════════════════════════════
//  LADO CLÍNICA (Vet Dashboard) — recepción y conversión del lead
// ═══════════════════════════════════════════════════════════════

const emergencyInclude = {
  pet: {
    include: {
      owner: { select: { fullName: true, phone: true, nationalId: true } },
      allergies: true,
      conditions: { where: { isActive: true } },
    },
  },
} as const;

// GET /emergencies/active -> alertas en curso para esta sucursal
router.get(
  '/active',
  withClinicContext,
  asyncHandler(async (req, res) => {
    const alerts = await prisma.emergencyAlert.findMany({
      where: {
        clinicId: req.clinicId!,
        status: { in: ['SENT', 'SEEN', 'ACCEPTED'] },
        emergency: { status: { in: ['BROADCASTING', 'ACCEPTED', 'EN_ROUTE'] } },
      },
      include: { emergency: { include: emergencyInclude } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: alerts });
  }),
);

// GET /emergencies/recent -> "Alertas de Guardia Recientes"
router.get(
  '/recent',
  withClinicContext,
  asyncHandler(async (req, res) => {
    const emergencies = await prisma.emergency.findMany({
      where: { acceptedClinicId: req.clinicId! },
      include: emergencyInclude,
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });
    res.json({ data: emergencies });
  }),
);

// POST /emergencies/alerts/:alertId/seen -> marcar vista
router.post(
  '/alerts/:alertId/seen',
  withClinicContext,
  validate({ params: z.object({ alertId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const alert = await prisma.emergencyAlert.findFirst({
      where: { id: req.params.alertId, clinicId: req.clinicId! },
    });
    if (!alert) throw ApiError.notFound('Alerta no encontrada');
    const updated = await prisma.emergencyAlert.update({
      where: { id: alert.id },
      data: { status: alert.status === 'SENT' ? 'SEEN' : alert.status, seenAt: new Date() },
    });
    res.json(updated);
  }),
);

// POST /emergencies/alerts/:alertId/accept -> la clínica acepta la urgencia
router.post(
  '/alerts/:alertId/accept',
  withClinicContext,
  validate({ params: z.object({ alertId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const alert = await prisma.emergencyAlert.findFirst({
      where: { id: req.params.alertId, clinicId: req.clinicId! },
      include: { emergency: true },
    });
    if (!alert) throw ApiError.notFound('Alerta no encontrada');
    if (alert.emergency.status !== 'BROADCASTING' && alert.emergency.acceptedClinicId !== req.clinicId) {
      throw ApiError.conflict('Esta urgencia ya fue tomada por otra clínica');
    }

    const result = await prisma.$transaction(async (tx) => {
      const emergency = await tx.emergency.update({
        where: { id: alert.emergencyId },
        data: { status: 'ACCEPTED', acceptedClinicId: req.clinicId!, acceptedAt: new Date() },
      });
      await tx.emergencyAlert.update({
        where: { id: alert.id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });
      await tx.emergencyAlert.updateMany({
        where: { emergencyId: alert.emergencyId, id: { not: alert.id }, status: { in: ['SENT', 'SEEN'] } },
        data: { status: 'EXPIRED' },
      });
      return emergency;
    });
    res.json(result);
  }),
);

// POST /emergencies/:id/attended -> lead efectivo: genera el cargo CPL a la clínica
router.post(
  '/:id/attended',
  withClinicContext,
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ hospitalized: z.boolean().optional() }),
  }),
  asyncHandler(async (req, res) => {
    const emergency = await prisma.emergency.findFirst({
      where: { id: req.params.id, acceptedClinicId: req.clinicId! },
      include: { ledgerEntry: true },
    });
    if (!emergency) throw ApiError.notFound('Urgencia no encontrada o no aceptada por tu sucursal');
    if (emergency.ledgerEntry) throw ApiError.conflict('Esta urgencia ya generó su cargo CPL');

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.emergency.update({
        where: { id: emergency.id },
        data: {
          status: req.body.hospitalized ? 'HOSPITALIZED' : 'ATTENDED',
          attendedAt: new Date(),
        },
      });
      const ledger = await tx.ledgerEntry.create({
        data: {
          type: 'CPL',
          status: 'PENDING',
          clinicId: req.clinicId!,
          emergencyId: emergency.id,
          grossUsd: 0,
          migoFeeUsd: env.CPL_FEE_USD,
        },
      });
      return { emergency: updated, ledger };
    });
    res.status(201).json(result);
  }),
);

export default router;
