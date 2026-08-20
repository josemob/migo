import { prisma } from '../../config/prisma';
import { sendOwnerReceiptEmail } from '../mail/mail.service';

/** Número de recibo legible (sin registro fiscal): R- + primeros 8 del id. */
export const receiptNumber = (id: string) => 'R-' + id.slice(0, 8).toUpperCase();

interface IssueReceiptInput {
  clinicId: string;
  ownerId: string;
  petId?: string | null;
  appointmentId?: string | null;
  concept: string;
  amountUsd: number;
  source: 'APP' | 'MANUAL';
  paymentMethod?: string | null;
}

/**
 * Emite un recibo al dueño (auto por pago en app o manual por la clínica) y le
 * envía el comprobante por correo. Idempotente por cita: si ya existe recibo para
 * `appointmentId`, devuelve el existente sin duplicar.
 */
export async function issueReceipt(input: IssueReceiptInput) {
  if (input.appointmentId) {
    const existing = await prisma.receipt.findUnique({ where: { appointmentId: input.appointmentId } });
    if (existing) return existing;
  }

  const receipt = await prisma.receipt.create({
    data: {
      clinicId: input.clinicId,
      ownerId: input.ownerId,
      petId: input.petId ?? null,
      appointmentId: input.appointmentId ?? null,
      concept: input.concept,
      amountUsd: input.amountUsd,
      source: input.source,
      paymentMethod: input.paymentMethod ?? (input.source === 'APP' ? 'app' : null),
    },
    include: {
      clinic: { select: { name: true } },
      owner: { select: { email: true, fullName: true } },
      pet: { select: { name: true } },
    },
  });

  // Recibo por correo (no bloquea)
  if (receipt.owner?.email) {
    const dateLabel = receipt.issuedAt.toLocaleDateString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'long' });
    void sendOwnerReceiptEmail(receipt.owner.email, receipt.owner.fullName ?? '', {
      number: receiptNumber(receipt.id),
      concept: receipt.concept,
      amountLabel: `$${Number(receipt.amountUsd).toFixed(2)}`,
      clinicName: receipt.clinic?.name ?? 'la clínica',
      dateLabel,
      petName: receipt.pet?.name ?? null,
    }).catch(() => {});
  }

  return receipt;
}
