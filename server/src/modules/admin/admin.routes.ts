import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate, requireRole } from '../../middleware/auth';
import { ApiError } from '../../utils/ApiError';

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

export default router;
