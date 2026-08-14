import { prisma } from '../../config/prisma';

/**
 * Restaura la disponibilidad de las clínicas cuyo cierre manual temporal ya venció
 * (unavailableUntil = inicio del día siguiente en hora de Venezuela). Devuelve cuántas
 * se reabrieron. Se llama desde el barrido periódico del server y, de forma perezosa,
 * podría llamarse antes de leer el directorio.
 */
export async function resetExpiredUnavailability(): Promise<number> {
  const r = await prisma.clinic.updateMany({
    where: { manuallyUnavailable: true, unavailableUntil: { lte: new Date() } },
    data: { manuallyUnavailable: false, unavailableUntil: null },
  });
  return r.count;
}
