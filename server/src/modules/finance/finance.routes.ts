import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate, requireRole } from '../../middleware/auth';
import { withClinicContext } from '../../middleware/clinicContext';
import { sendInvoiceReceiptEmail } from '../mail/mail.service';
import { issueReceipt, receiptNumber } from '../receipts/receipt.service';

const router = Router();
router.use(authenticate, withClinicContext);

const monthRange = (ref = new Date()) => {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
  return { start, end };
};

// GET /finance/summary -> tarjetas superiores de la pantalla
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const clinicId = req.clinicId!;
    const { start, end } = monthRange();

    const [completed, commissions, cplAgg] = await Promise.all([
      // ingresos locales del mes (citas completadas)
      prisma.appointment.aggregate({
        where: { clinicId, status: 'COMPLETED', updatedAt: { gte: start, lt: end } },
        _sum: { priceUsd: true },
      }),
      // comisiones que retiene Migo (booking)
      prisma.ledgerEntry.aggregate({
        where: { clinicId, type: 'BOOKING_COMMISSION', createdAt: { gte: start, lt: end } },
        _sum: { migoFeeUsd: true },
      }),
      // leads CPL del mes
      prisma.ledgerEntry.aggregate({
        where: { clinicId, type: 'CPL', createdAt: { gte: start, lt: end } },
        _sum: { migoFeeUsd: true },
        _count: true,
      }),
    ]);

    res.json({
      period: { start, end },
      monthlyRevenueUsd: Number(completed._sum.priceUsd ?? 0),
      migoCommissionsUsd: Number(commissions._sum.migoFeeUsd ?? 0),
      cpl: {
        leads: cplAgg._count,
        totalUsd: Number(cplAgg._sum.migoFeeUsd ?? 0),
      },
    });
  }),
);

// GET /finance/cpl -> "Reporte de CPL Emergencias (Canalizaciones)"
router.get(
  '/cpl',
  asyncHandler(async (req, res) => {
    const entries = await prisma.ledgerEntry.findMany({
      where: { clinicId: req.clinicId!, type: 'CPL' },
      include: {
        emergency: {
          include: {
            pet: { select: { name: true, breed: true, species: true } },
            owner: { select: { fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const rows = entries.map((e) => ({
      id: e.id,
      date: e.createdAt,
      pet: e.emergency?.pet,
      owner: e.emergency?.owner?.fullName,
      status: e.emergency?.status,
      amountUsd: Number(e.migoFeeUsd),
      ledgerStatus: e.status,
    }));
    res.json({ data: rows });
  }),
);

// GET /finance/invoices -> facturas postpago de la sucursal
router.get(
  '/invoices',
  asyncHandler(async (req, res) => {
    const invoices = await prisma.invoice.findMany({
      where: { clinicId: req.clinicId! },
      orderBy: { periodStart: 'desc' },
    });
    res.json({ data: invoices });
  }),
);

// POST /finance/invoices/generate -> corte del período: agrupa los CPL pendientes en una factura
router.post(
  '/invoices/generate',
  requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validate({
    body: z.object({
      periodStart: z.coerce.date(),
      periodEnd: z.coerce.date(),
      dueAt: z.coerce.date().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const clinicId = req.clinicId!;
    const { periodStart, periodEnd, dueAt } = req.body;

    const invoice = await prisma.$transaction(async (tx) => {
      const pendingCpl = await tx.ledgerEntry.findMany({
        where: {
          clinicId,
          type: 'CPL',
          status: 'PENDING',
          invoiceId: null,
          createdAt: { gte: periodStart, lte: periodEnd },
        },
      });
      const cplSubtotal = pendingCpl.reduce((sum, e) => sum + Number(e.migoFeeUsd), 0);

      const created = await tx.invoice.create({
        data: {
          clinicId,
          periodStart,
          periodEnd,
          status: 'ISSUED',
          issuedAt: new Date(),
          dueAt,
          leadCount: pendingCpl.length,
          cplSubtotalUsd: cplSubtotal,
          totalUsd: cplSubtotal,
        },
      });
      await tx.ledgerEntry.updateMany({
        where: { id: { in: pendingCpl.map((e) => e.id) } },
        data: { invoiceId: created.id, status: 'BILLED', billedAt: new Date() },
      });
      return created;
    });
    res.status(201).json(invoice);
  }),
);

// POST /finance/invoices/:id/pay -> registrar pago de la factura (levanta suspensión)
router.post(
  '/invoices/:id/pay',
  requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ reference: z.string().optional() }),
  }),
  asyncHandler(async (req, res) => {
    const clinicId = req.clinicId!;
    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.update({
        where: { id: req.params.id },
        data: { status: 'PAID', paidAt: new Date(), reference: req.body.reference },
      });
      await tx.ledgerEntry.updateMany({
        where: { invoiceId: inv.id },
        data: { status: 'PAID', paidAt: new Date() },
      });
      // si no quedan facturas vencidas, se reactiva el radar
      const overdue = await tx.invoice.count({ where: { clinicId, status: 'OVERDUE' } });
      if (overdue === 0) {
        await tx.clinic.update({
          where: { id: clinicId },
          data: { radarSuspended: false, suspendedAt: null },
        });
      }
      return inv;
    });

    // Recibo de pago por correo (al admin/dueño del comercio)
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { name: true, organization: { select: { owner: { select: { email: true, fullName: true } } } } },
    });
    const owner = clinic?.organization?.owner;
    if (owner?.email) {
      const dateLabel = (invoice.paidAt ?? new Date()).toLocaleDateString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'long' });
      void sendInvoiceReceiptEmail(owner.email, owner.fullName ?? '', {
        invoiceNumber: invoice.id.slice(0, 8).toUpperCase(),
        amountLabel: `$${Number(invoice.totalUsd).toFixed(2)}`,
        clinicName: clinic?.name ?? 'tu clínica',
        dateLabel,
        concept: 'Facturación Migo (leads CPL + plan) del período',
      }).catch(() => {});
    }

    res.json(invoice);
  }),
);

// GET /finance/payouts -> liquidaciones (pagos de Migo -> la clínica)
router.get(
  '/payouts',
  asyncHandler(async (req, res) => {
    const payouts = await prisma.payout.findMany({
      where: { clinicId: req.clinicId! },
      orderBy: { periodStart: 'desc' },
      take: 100,
    });
    res.json({ data: payouts });
  }),
);

// GET / PUT /finance/settlement -> "Datos de Liquidación local"
router.get(
  '/settlement',
  asyncHandler(async (req, res) => {
    const account = await prisma.settlementAccount.findUnique({
      where: { clinicId: req.clinicId! },
    });
    res.json(account);
  }),
);

router.put(
  '/settlement',
  requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validate({
    body: z.object({
      bankName: z.string(),
      accountType: z.enum(['CHECKING', 'SAVINGS']).default('CHECKING'),
      accountLast4: z.string().max(4).optional(),
      holderName: z.string().optional(),
      holderIdNumber: z.string().optional(),
      c2pEnabled: z.boolean().default(false),
      mobilePayPhone: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const account = await prisma.settlementAccount.upsert({
      where: { clinicId: req.clinicId! },
      create: { ...req.body, clinicId: req.clinicId! },
      update: req.body,
    });
    res.json(account);
  }),
);

// POST /finance/receipts -> emitir un recibo MANUAL al dueño (servicio hecho en el local)
router.post(
  '/receipts',
  requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validate({
    body: z.object({
      ownerId: z.string().uuid(),
      petId: z.string().uuid().optional(),
      concept: z.string().min(1).max(200),
      amountUsd: z.number().positive().max(100000),
      paymentMethod: z.string().max(40).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const receipt = await issueReceipt({
      clinicId: req.clinicId!,
      ownerId: req.body.ownerId,
      petId: req.body.petId ?? null,
      concept: req.body.concept,
      amountUsd: req.body.amountUsd,
      source: 'MANUAL',
      paymentMethod: req.body.paymentMethod ?? null,
    });
    res.status(201).json({ id: receipt.id, number: receiptNumber(receipt.id) });
  }),
);

// GET /finance/receipts -> recibos emitidos por la clínica (dueño)
router.get(
  '/receipts',
  asyncHandler(async (req, res) => {
    const rows = await prisma.receipt.findMany({
      where: { clinicId: req.clinicId! },
      orderBy: { issuedAt: 'desc' },
      take: 200,
      include: { owner: { select: { fullName: true } }, pet: { select: { name: true } } },
    });
    const data = rows.map((r) => ({
      id: r.id,
      number: receiptNumber(r.id),
      concept: r.concept,
      amountUsd: Number(r.amountUsd),
      source: r.source,
      paymentMethod: r.paymentMethod,
      issuedAt: r.issuedAt.toISOString(),
      ownerName: r.owner?.fullName ?? null,
      petName: r.pet?.name ?? null,
    }));
    res.json({ data });
  }),
);

export default router;
