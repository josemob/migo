import { prisma } from '../../config/prisma';

export type PlanAudience = 'VET' | 'CLINIC';

// Serializa un plan del catálogo (Decimals -> number) para las respuestas HTTP.
export function serializePlan(p: {
  id: string; audience: string; code: string; name: string;
  priceUsd: unknown; commissionRate: unknown; billingPeriod: string;
  maxPatients: number | null; maxSpecialists: number | null;
  features: unknown; highlight: string | null; sortOrder: number;
  isActive: boolean; isDefault: boolean;
}) {
  return {
    id: p.id, audience: p.audience, code: p.code, name: p.name,
    priceUsd: Number(p.priceUsd), commissionRate: Number(p.commissionRate),
    billingPeriod: p.billingPeriod, maxPatients: p.maxPatients, maxSpecialists: p.maxSpecialists,
    features: p.features ?? null, highlight: p.highlight, sortOrder: p.sortOrder,
    isActive: p.isActive, isDefault: p.isDefault,
  };
}

export async function listPlans(audience?: PlanAudience) {
  const rows = await prisma.plan.findMany({
    where: audience ? { audience } : {},
    orderBy: [{ audience: 'asc' }, { sortOrder: 'asc' }],
  });
  return rows.map(serializePlan);
}

export async function defaultPlan(audience: PlanAudience) {
  return prisma.plan.findFirst({ where: { audience, isDefault: true, isActive: true } });
}

/**
 * Sincroniza el override de comisión de la clínica con el plan EFECTIVO. El motor de
 * comisiones de reservas ya lee `clinic.bookingCommissionRate`, así que con esto la
 * comisión pasa a depender del plan sin tocar el flujo de facturación.
 */
export async function syncClinicCommission(clinicId: string, planId: string | null) {
  if (!planId) return;
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || plan.audience !== 'CLINIC') return;
  await prisma.clinic.update({
    where: { id: clinicId },
    data: {
      bookingCommissionRate: plan.commissionRate,
      // Alinea el enum legado y la prioridad de radar según el precio del plan.
      plan: Number(plan.priceUsd) > 0 ? 'PRO' : 'FREEMIUM',
      radarPriority: Number(plan.priceUsd) >= 70 ? 2 : Number(plan.priceUsd) > 0 ? 1 : 0,
    },
  });
}

/**
 * Aplica la elección de plan de un profesional/clínica. Si el plan es el gratuito
 * (isDefault) se activa de inmediato; si es de pago, queda como pendingPlanId
 * (pendiente de pago) y el plan efectivo no cambia hasta que exista la pasarela.
 */
export async function selectPlanForVet(userId: string, planId: string) {
  const plan = await prisma.plan.findFirst({ where: { id: planId, audience: 'VET', isActive: true } });
  if (!plan) return { ok: false as const, reason: 'Plan no disponible' };
  if (plan.isDefault || Number(plan.priceUsd) === 0) {
    await prisma.vetSubscription.update({ where: { userId }, data: { planId: plan.id, pendingPlanId: null } });
    return { ok: true as const, applied: true as const };
  }
  await prisma.vetSubscription.update({ where: { userId }, data: { pendingPlanId: plan.id } });
  return { ok: true as const, applied: false as const };
}

export async function selectPlanForClinic(clinicId: string, planId: string) {
  const plan = await prisma.plan.findFirst({ where: { id: planId, audience: 'CLINIC', isActive: true } });
  if (!plan) return { ok: false as const, reason: 'Plan no disponible' };
  if (plan.isDefault || Number(plan.priceUsd) === 0) {
    await prisma.clinic.update({ where: { id: clinicId }, data: { planId: plan.id, pendingPlanId: null } });
    await syncClinicCommission(clinicId, plan.id);
    return { ok: true as const, applied: true as const };
  }
  await prisma.clinic.update({ where: { id: clinicId }, data: { pendingPlanId: plan.id } });
  return { ok: true as const, applied: false as const };
}
