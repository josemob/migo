import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

/**
 * Facturación Migo -> clínica (postpago, una factura por mes).
 *
 * Cada servicio concluido con costo genera un cargo (LedgerEntry) que se suma al
 * momento a la factura ABIERTA del mes de la clínica:
 *  - cita completada con precio y pagada en el local -> comisión (BOOKING_COMMISSION)
 *  - urgencia atendida -> CPL
 * El día 1 la factura del mes anterior pasa a EMITIDA con vencimiento a 10 días
 * (closeFinishedInvoices, lo corre el barrido periódico de server.ts).
 *
 * Las citas pagadas DENTRO de la app no entran aquí: ahí Migo ya retuvo su comisión.
 */

type Tx = Prisma.TransactionClient;

const VE_OFFSET_MS = 4 * 60 * 60 * 1000; // Venezuela = UTC-4, sin horario de verano
export const DUE_DAYS = 10;

/** Mes calendario (hora de Venezuela) que contiene `at`: [inicio, fin]. */
export function monthPeriod(at: Date): { start: Date; end: Date } {
  const ve = new Date(at.getTime() - VE_OFFSET_MS);
  const start = new Date(Date.UTC(ve.getUTCFullYear(), ve.getUTCMonth(), 1) + VE_OFFSET_MS);
  const nextStart = new Date(Date.UTC(ve.getUTCFullYear(), ve.getUTCMonth() + 1, 1) + VE_OFFSET_MS);
  return { start, end: new Date(nextStart.getTime() - 1) };
}

/** Factura abierta del mes de la clínica (la crea si no existe). */
async function openInvoiceFor(tx: Tx, clinicId: string, at: Date) {
  const { start, end } = monthPeriod(at);
  // Candado por clínica dentro de la transacción: dos servicios que concluyen a la
  // vez no deben crear dos facturas abiertas para el mismo mes.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'invoice:' + clinicId}))`;
  const existing = await tx.invoice.findFirst({
    where: { clinicId, status: 'OPEN', periodStart: start },
  });
  if (existing) return existing;
  return tx.invoice.create({
    data: { clinicId, status: 'OPEN', periodStart: start, periodEnd: end },
  });
}

/** Recalcula los totales de la factura a partir de sus cargos. */
export async function recalcInvoice(tx: Tx, invoiceId: string) {
  const entries = await tx.ledgerEntry.findMany({
    where: { invoiceId },
    select: { type: true, migoFeeUsd: true },
  });
  const cpl = entries.filter((e) => e.type === 'CPL');
  const cplSubtotal = cpl.reduce((s, e) => s + Number(e.migoFeeUsd), 0);
  const total = entries.reduce((s, e) => s + Number(e.migoFeeUsd), 0);
  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      leadCount: cpl.length,
      cplSubtotalUsd: cplSubtotal.toFixed(2),
      totalUsd: total.toFixed(2),
    },
  });
}

/** Suma un cargo recién creado a la factura abierta del mes. */
export async function addChargeToOpenInvoice(tx: Tx, ledgerEntryId: string, clinicId: string, at = new Date()) {
  const invoice = await openInvoiceFor(tx, clinicId, at);
  await tx.ledgerEntry.update({ where: { id: ledgerEntryId }, data: { invoiceId: invoice.id } });
  await recalcInvoice(tx, invoice.id);
  return invoice.id;
}

/**
 * Cierra las facturas abiertas de meses que ya terminaron: pasan a EMITIDA con
 * vencimiento a DUE_DAYS días y sus cargos quedan facturados. Devuelve cuántas cerró.
 */
export async function closeFinishedInvoices(now = new Date()): Promise<number> {
  const due = await prisma.invoice.findMany({
    where: { status: 'OPEN', periodEnd: { lt: now } },
    select: { id: true, totalUsd: true },
  });
  for (const inv of due) {
    await prisma.$transaction(async (tx) => {
      // Sin monto (p. ej. cargos anulados): se anula en vez de cobrar $0.
      if (Number(inv.totalUsd) <= 0) {
        await tx.invoice.update({ where: { id: inv.id }, data: { status: 'VOID' } });
        return;
      }
      await tx.invoice.update({
        where: { id: inv.id },
        data: { status: 'ISSUED', issuedAt: now, dueAt: new Date(now.getTime() + DUE_DAYS * 24 * 3600 * 1000) },
      });
      await tx.ledgerEntry.updateMany({
        where: { invoiceId: inv.id, status: 'PENDING' },
        data: { status: 'BILLED', billedAt: now },
      });
    });
  }
  return due.length;
}
