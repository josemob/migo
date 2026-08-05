import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate, requireRole } from '../../middleware/auth';
import { ApiError } from '../../utils/ApiError';
import { sendPush } from '../push/push.service';

const router = Router();
router.use(authenticate, requireRole('SUPER_ADMIN'));

// Deriva el estado operativo de una clínica para el panel Super Admin
function clinicStatus(c: { verificationStatus: string; radarSuspended: boolean }): 'PENDING' | 'ACTIVE' | 'SUSPENDED' {
  if (c.radarSuspended || c.verificationStatus === 'REJECTED') return 'SUSPENDED';
  if (c.verificationStatus === 'VERIFIED') return 'ACTIVE';
  return 'PENDING';
}

// GET /admin/overview -> Consola de Control (métricas globales)
router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startWeek = new Date(startToday.getTime() - 6 * 24 * 3600_000);

    const [clinics, emergenciasHoy, vetsCount, monthLedger, weekLedger, weekEmergencies] = await Promise.all([
      prisma.clinic.findMany({ select: { verificationStatus: true, radarSuspended: true } }),
      prisma.emergency.count({ where: { createdAt: { gte: startToday } } }),
      prisma.user.count({ where: { role: 'VET' } }),
      prisma.ledgerEntry.findMany({ where: { createdAt: { gte: startMonth } }, select: { grossUsd: true, migoFeeUsd: true } }),
      prisma.ledgerEntry.findMany({ where: { createdAt: { gte: startWeek } }, select: { grossUsd: true, createdAt: true } }),
      prisma.emergency.findMany({ where: { createdAt: { gte: startWeek } }, select: { createdAt: true } }),
    ]);

    const activos = clinics.filter((c) => clinicStatus(c) === 'ACTIVE').length;
    const gmvMensual = monthLedger.reduce((s, l) => s + Number(l.grossUsd ?? 0), 0);
    const revenueMigo = monthLedger.reduce((s, l) => s + Number(l.migoFeeUsd ?? 0), 0);

    // Series semanales (Lun..Dom) para el gráfico de tendencias
    const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    const trend = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startWeek.getTime() + i * 24 * 3600_000);
      const key = d.toDateString();
      const revenue = weekLedger.filter((l) => new Date(l.createdAt).toDateString() === key).reduce((s, l) => s + Number(l.grossUsd ?? 0), 0);
      const emergencies = weekEmergencies.filter((e) => new Date(e.createdAt).toDateString() === key).length;
      return { label: days[d.getDay()], revenue: Number(revenue.toFixed(2)), emergencies };
    });

    res.json({
      comerciosActivos: activos,
      emergenciasHoy,
      gmvMensual: Number(gmvMensual.toFixed(2)),
      revenueMigo: Number(revenueMigo.toFixed(2)),
      vetsGuardia: vetsCount,
      solicitudes: clinics.filter((c) => clinicStatus(c) === 'PENDING').length,
      suspendidos: clinics.filter((c) => clinicStatus(c) === 'SUSPENDED').length,
      trend,
    });
  }),
);

// GET /admin/clinics -> Gestión de Comercios (registro + solicitudes)
router.get(
  '/clinics',
  asyncHandler(async (_req, res) => {
    const clinics = await prisma.clinic.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        verificationStatus: true,
        radarSuspended: true,
        plan: true,
        createdAt: true,
        organization: { select: { rif: true, name: true, owner: { select: { fullName: true } } } },
      },
    });

    const data = clinics.map((c) => ({
      id: c.id,
      name: c.name,
      representative: c.organization?.owner?.fullName ?? '—',
      rif: c.organization?.rif ?? '—',
      orgName: c.organization?.name ?? '—',
      plan: c.plan,
      createdAt: c.createdAt,
      verificationStatus: c.verificationStatus,
      status: clinicStatus(c),
    }));

    const counts = {
      solicitudes: data.filter((c) => c.status === 'PENDING').length,
      activos: data.filter((c) => c.status === 'ACTIVE').length,
      suspendidos: data.filter((c) => c.status === 'SUSPENDED').length,
    };

    res.json({ data, counts });
  }),
);

// POST /admin/clinics/:id/status -> aprobar / rechazar / suspender / reactivar
router.post(
  '/clinics/:id/status',
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ action: z.enum(['approve', 'reject', 'suspend', 'reactivate']), reason: z.string().optional() }),
  }),
  asyncHandler(async (req, res) => {
    const clinic = await prisma.clinic.findUnique({ where: { id: req.params.id }, select: { id: true, organizationId: true } });
    if (!clinic) throw ApiError.notFound('Clínica no encontrada');

    const now = new Date();
    const data =
      req.body.action === 'approve'
        ? { verificationStatus: 'VERIFIED' as const, verifiedAt: now, radarSuspended: false, suspendedAt: null }
        : req.body.action === 'reject'
        ? { verificationStatus: 'REJECTED' as const }
        : req.body.action === 'suspend'
        ? { radarSuspended: true, suspendedAt: now }
        : { radarSuspended: false, suspendedAt: null, verificationStatus: 'VERIFIED' as const, verifiedAt: now };

    const updated = await prisma.clinic.update({ where: { id: clinic.id }, data });

    // Al aprobar/reactivar, la organización también queda verificada
    if (req.body.action === 'approve' || req.body.action === 'reactivate') {
      await prisma.organization.update({ where: { id: clinic.organizationId }, data: { verificationStatus: 'VERIFIED', verifiedAt: now } });
    }

    res.json({ id: updated.id, verificationStatus: updated.verificationStatus, radarSuspended: updated.radarSuspended });
  }),
);

// ─────────────────────────────────────────────────────────────
//  VERIFICACIÓN DE VETERINARIOS
// ─────────────────────────────────────────────────────────────
router.get(
  '/vets',
  asyncHandler(async (_req, res) => {
    const staff = await prisma.clinicStaff.findMany({
      where: { position: 'VET' },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, cmvLicense: true, collegiateNumber: true, specialty: true, verificationStatus: true, verifiedAt: true,
        user: { select: { fullName: true, email: true, avatarUrl: true } },
        clinic: { select: { name: true } },
      },
    });
    const map = (s: (typeof staff)[number]) => ({
      id: s.id,
      fullName: s.user.fullName,
      email: s.user.email,
      avatarUrl: s.user.avatarUrl,
      clinic: s.clinic?.name ?? '—',
      specialty: s.specialty ?? 'Médico Veterinario',
      collegiateNumber: s.collegiateNumber ?? s.cmvLicense ?? '—',
      verificationStatus: s.verificationStatus,
      verifiedAt: s.verifiedAt,
    });
    res.json({
      pending: staff.filter((s) => s.verificationStatus !== 'VERIFIED').map(map),
      verified: staff.filter((s) => s.verificationStatus === 'VERIFIED').map(map),
    });
  }),
);

router.post(
  '/vets/:id/verify',
  validate({ params: z.object({ id: z.string().uuid() }), body: z.object({ action: z.enum(['approve', 'reject']) }) }),
  asyncHandler(async (req, res) => {
    const staff = await prisma.clinicStaff.findUnique({ where: { id: req.params.id } });
    if (!staff) throw ApiError.notFound('Veterinario no encontrado');
    const updated = await prisma.clinicStaff.update({
      where: { id: staff.id },
      data: req.body.action === 'approve' ? { verificationStatus: 'VERIFIED', verifiedAt: new Date() } : { verificationStatus: 'REJECTED' },
    });
    res.json({ id: updated.id, verificationStatus: updated.verificationStatus });
  }),
);

// ─────────────────────────────────────────────────────────────
//  USUARIOS & MASCOTAS (B2C)
// ─────────────────────────────────────────────────────────────
router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const users = await prisma.user.findMany({
      where: {
        role: 'PET_OWNER',
        ...(q ? { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { nationalId: { contains: q, mode: 'insensitive' } }] } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true, fullName: true, email: true, nationalId: true, status: true, updatedAt: true, avatarUrl: true,
        pets: { select: { name: true, species: true } },
        subscriptions: { where: { status: 'ACTIVE' }, select: { plan: true, priceUsd: true, renewsAt: true }, take: 1 },
        _count: { select: { appointments: true } },
      },
    });
    res.json({
      data: users.map((u) => ({
        id: u.id, fullName: u.fullName, email: u.email, nationalId: u.nationalId, status: u.status,
        avatarUrl: u.avatarUrl, lastAccess: u.updatedAt, bookings: u._count.appointments,
        pets: u.pets, subscription: u.subscriptions[0] ?? null,
      })),
    });
  }),
);

router.post(
  '/users/:id/suspend',
  validate({ params: z.object({ id: z.string().uuid() }), body: z.object({ suspend: z.boolean() }) }),
  asyncHandler(async (req, res) => {
    const u = await prisma.user.update({ where: { id: req.params.id }, data: { status: req.body.suspend ? 'SUSPENDED' : 'ACTIVE' } });
    res.json({ id: u.id, status: u.status });
  }),
);

router.post(
  '/users/:id/push',
  validate({ params: z.object({ id: z.string().uuid() }), body: z.object({ title: z.string().min(1), body: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    await sendPush(req.params.id!, { title: req.body.title, body: req.body.body, data: { type: 'admin' } });
    res.status(202).json({ ok: true });
  }),
);

// ─────────────────────────────────────────────────────────────
//  FINANZAS, CPL & LIQUIDACIONES
// ─────────────────────────────────────────────────────────────
router.get(
  '/finance',
  asyncHandler(async (_req, res) => {
    const [ledger, payouts] = await Promise.all([
      prisma.ledgerEntry.findMany({ select: { type: true, status: true, grossUsd: true, migoFeeUsd: true, clinicId: true, clinic: { select: { name: true, radarSuspended: true } } } }),
      prisma.payout.findMany({
        where: { status: { in: ['DRAFT', 'PROCESSING'] } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, amountUsd: true, status: true, clinic: { select: { name: true, settlementAccount: { select: { bankName: true, accountType: true, accountLast4: true } } } } },
      }),
    ]);

    const cpl = ledger.filter((l) => l.type === 'CPL');
    const commissions = ledger.filter((l) => l.type === 'BOOKING_COMMISSION');
    const cplTotal = cpl.reduce((s, l) => s + Number(l.migoFeeUsd), 0);
    const comisionesRetenidas = commissions.reduce((s, l) => s + Number(l.migoFeeUsd), 0);
    const liquidacionesPendientes = payouts.reduce((s, p) => s + Number(p.amountUsd), 0);

    // Detalle de cuentas CPL por clínica
    const byClinic = new Map<string, { clinic: string; leads: number; monto: number; mora: boolean }>();
    for (const l of cpl) {
      const key = l.clinicId ?? 'sin';
      const cur = byClinic.get(key) ?? { clinic: l.clinic?.name ?? '—', leads: 0, monto: 0, mora: !!l.clinic?.radarSuspended };
      cur.leads += 1;
      cur.monto += Number(l.migoFeeUsd);
      byClinic.set(key, cur);
    }
    const clinicasEnMora = [...byClinic.values()].filter((c) => c.mora).length;

    res.json({
      cplTotal: Number(cplTotal.toFixed(2)),
      comisionesRetenidas: Number(comisionesRetenidas.toFixed(2)),
      liquidacionesPendientes: Number(liquidacionesPendientes.toFixed(2)),
      clinicasEnMora,
      detalleCpl: [...byClinic.values()].map((c) => ({ ...c, monto: Number(c.monto.toFixed(2)) })),
      payouts: payouts.map((p) => ({
        id: p.id, clinic: p.clinic?.name ?? '—', amountUsd: Number(p.amountUsd),
        bank: p.clinic?.settlementAccount ? `${p.clinic.settlementAccount.bankName} · ${p.clinic.settlementAccount.accountLast4 ?? ''}` : '—',
        status: p.status,
      })),
    });
  }),
);

router.post(
  '/payouts/:id/approve',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const p = await prisma.payout.update({ where: { id: req.params.id }, data: { status: 'PAID', processedAt: new Date() } });
    res.json({ id: p.id, status: p.status });
  }),
);

// ─────────────────────────────────────────────────────────────
//  MONITOR DE EMERGENCIAS
// ─────────────────────────────────────────────────────────────
router.get(
  '/emergencies',
  asyncHandler(async (_req, res) => {
    const emergencies = await prisma.emergency.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true, status: true, aiSummary: true, triageLevel: true, createdAt: true, acceptedAt: true, attendedAt: true,
        owner: { select: { fullName: true } },
        pet: { select: { name: true, species: true } },
        acceptedClinic: { select: { name: true } },
      },
    });

    const active = emergencies.filter((e) => !['CANCELLED', 'EXPIRED'].includes(e.status));
    // Métricas de respuesta por clínica (atendidas + tiempo promedio de aceptación)
    const metrics = new Map<string, { clinic: string; attended: number; totalMs: number; n: number }>();
    for (const e of emergencies) {
      if (!e.acceptedClinic) continue;
      const cur = metrics.get(e.acceptedClinic.name) ?? { clinic: e.acceptedClinic.name, attended: 0, totalMs: 0, n: 0 };
      if (e.status === 'ATTENDED' || e.status === 'HOSPITALIZED') cur.attended += 1;
      if (e.acceptedAt) { cur.totalMs += new Date(e.acceptedAt).getTime() - new Date(e.createdAt).getTime(); cur.n += 1; }
      metrics.set(e.acceptedClinic.name, cur);
    }

    res.json({
      activeCount: active.length,
      feed: emergencies.map((e) => ({
        id: e.id, status: e.status, triageLevel: e.triageLevel, report: e.aiSummary ?? 'Triaje en proceso',
        pet: e.pet.name, species: e.pet.species, owner: e.owner.fullName, clinic: e.acceptedClinic?.name ?? null, createdAt: e.createdAt,
      })),
      metrics: [...metrics.values()].map((m) => ({ clinic: m.clinic, attended: m.attended, avgResponseSec: m.n ? Math.round(m.totalMs / m.n / 1000) : null })),
    });
  }),
);

// ─────────────────────────────────────────────────────────────
//  MIGO AI & CONTENIDO
// ─────────────────────────────────────────────────────────────
router.get(
  '/ai/rules',
  asyncHandler(async (_req, res) => {
    const rules = await prisma.aiTriageRule.findMany({ orderBy: { createdAt: 'asc' } });
    res.json({ data: rules });
  }),
);

router.post(
  '/ai/rules',
  validate({
    body: z.object({
      name: z.string().min(1),
      keywords: z.array(z.string().min(1)).default([]),
      responseTemplate: z.string().min(1),
      severity: z.enum(['CRITICA', 'MODERADA', 'BAJA']).default('MODERADA'),
      active: z.boolean().default(true),
    }),
  }),
  asyncHandler(async (req, res) => {
    const rule = await prisma.aiTriageRule.create({ data: req.body });
    res.status(201).json(rule);
  }),
);

router.post(
  '/ai/rules/:id/toggle',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const rule = await prisma.aiTriageRule.findUnique({ where: { id: req.params.id } });
    if (!rule) throw ApiError.notFound('Regla no encontrada');
    const updated = await prisma.aiTriageRule.update({ where: { id: rule.id }, data: { active: !rule.active } });
    res.json({ id: updated.id, active: updated.active });
  }),
);

router.delete(
  '/ai/rules/:id',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    await prisma.aiTriageRule.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);

router.get(
  '/ai/knowledge',
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const data = await prisma.aiKnowledgeEntry.findMany({
      where: q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { category: { contains: q, mode: 'insensitive' } }] } : {},
      orderBy: { createdAt: 'asc' },
    });
    res.json({ data });
  }),
);

router.post(
  '/ai/knowledge',
  validate({
    body: z.object({
      title: z.string().min(1),
      category: z.string().min(1),
      severity: z.string().min(1),
      description: z.string().min(1),
    }),
  }),
  asyncHandler(async (req, res) => {
    const entry = await prisma.aiKnowledgeEntry.create({ data: req.body });
    res.status(201).json(entry);
  }),
);

router.delete(
  '/ai/knowledge/:id',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    await prisma.aiKnowledgeEntry.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);

// ─────────────────────────────────────────────────────────────
//  CONFIGURACIÓN GLOBAL
// ─────────────────────────────────────────────────────────────
async function getConfig() {
  return (
    (await prisma.platformConfig.findUnique({ where: { id: 'singleton' } })) ??
    (await prisma.platformConfig.create({ data: { id: 'singleton' } }))
  );
}

router.get(
  '/config',
  asyncHandler(async (_req, res) => {
    const cfg = await getConfig();
    const admins = await prisma.user.findMany({
      where: { role: 'SUPER_ADMIN' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, fullName: true, email: true, status: true, updatedAt: true },
    });
    res.json({
      config: {
        cplFeeUsd: Number(cfg.cplFeeUsd),
        commissionRate: Number(cfg.commissionRate),
        bcvRate: Number(cfg.bcvRate),
        paymentGateway: cfg.paymentGateway,
      },
      admins: admins.map((a) => ({ id: a.id, fullName: a.fullName, email: a.email, status: a.status, lastAccess: a.updatedAt })),
    });
  }),
);

router.patch(
  '/config',
  validate({
    body: z.object({
      cplFeeUsd: z.number().min(0).optional(),
      commissionRate: z.number().min(0).max(1).optional(),
      bcvRate: z.number().min(0).optional(),
      paymentGateway: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    await getConfig();
    const cfg = await prisma.platformConfig.update({ where: { id: 'singleton' }, data: req.body });
    res.json({
      cplFeeUsd: Number(cfg.cplFeeUsd),
      commissionRate: Number(cfg.commissionRate),
      bcvRate: Number(cfg.bcvRate),
      paymentGateway: cfg.paymentGateway,
    });
  }),
);

export default router;
