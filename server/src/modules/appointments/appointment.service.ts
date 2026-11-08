import { prisma } from '../../config/prisma';
import { sendPush } from '../push/push.service';

export const EXPIRED_REASON = 'La clínica no respondió a tiempo.';

/**
 * Cancela las solicitudes de cita (PENDING) cuya hora ya llegó sin que nadie del equipo
 * las aceptara, y avisa al dueño para que elija otro horario.
 *
 * Solo se avisa por push de las que vencieron en las últimas 24 h: las solicitudes viejas
 * (datos de antes de este flujo) se cierran en silencio para no llenar de avisos al dueño.
 */
export async function expirePendingAppointments(): Promise<number> {
  const now = new Date();
  const stale = await prisma.appointment.findMany({
    where: { status: 'PENDING', scheduledAt: { lt: now } },
    select: { id: true, scheduledAt: true, bookedById: true, pet: { select: { name: true } }, clinic: { select: { name: true } } },
    take: 200,
  });
  if (!stale.length) return 0;

  let closed = 0;
  for (const a of stale) {
    // Condicionado a PENDING: si alguien la aceptó justo ahora, no se toca.
    const { count } = await prisma.appointment.updateMany({
      where: { id: a.id, status: 'PENDING' },
      data: { status: 'CANCELLED', cancelReason: EXPIRED_REASON },
    });
    if (!count) continue;
    closed++;
    if (now.getTime() - a.scheduledAt.getTime() < 24 * 3600 * 1000) {
      void sendPush(a.bookedById, {
        title: 'Tu solicitud de cita venció',
        body: `${a.clinic.name} no respondió a tiempo la cita de ${a.pet.name}. Puedes elegir otro horario.`,
        data: { type: 'appointment', appointmentId: a.id, status: 'CANCELLED' },
      }).catch(() => {});
    }
  }
  return closed;
}
