/**
 * Siembra el catálogo de planes con los valores del informe ejecutivo (editables luego
 * desde el Super Admin). Idempotente: upsert por `code`. No pisa ediciones manuales de
 * precio/comisión si el plan ya existe (solo crea los que falten).
 *   node prisma/seed-plans.mjs
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

const PLANS = [
  // Profesionales independientes
  { code: 'vet_semilla', audience: 'VET', name: 'Semilla', priceUsd: 0, commissionRate: 0.15, maxPatients: 15, isDefault: true, sortOrder: 0,
    highlight: null, features: { reminders: false, fiscalBilling: false, featured: 'Estándar' } },
  { code: 'vet_pro', audience: 'VET', name: 'Pro', priceUsd: 10, commissionRate: 0.10, maxPatients: null, isDefault: false, sortOrder: 1,
    highlight: 'Destacado', features: { reminders: true, fiscalBilling: 'addon', featured: 'Destacado' } },
  { code: 'vet_elite', audience: 'VET', name: 'Elite', priceUsd: 20, commissionRate: 0.07, maxPatients: null, isDefault: false, sortOrder: 2,
    highlight: 'Top', features: { reminders: true, fiscalBilling: true, featured: 'Top búsquedas' } },
  // Establecimientos
  { code: 'clinic_basico', audience: 'CLINIC', name: 'Básico', priceUsd: 15, commissionRate: 0.10, maxSpecialists: 2, isDefault: true, sortOrder: 0,
    highlight: 'Estándar', features: { emergencyMap: 'Estándar', jobs: 'paid', fiscalBilling: 'addon' } },
  { code: 'clinic_pro', audience: 'CLINIC', name: 'Pro 24/7', priceUsd: 35, commissionRate: 0.08, maxSpecialists: 6, isDefault: false, sortOrder: 1,
    highlight: 'Destacado', features: { emergencyMap: 'Pin rojo', jobs: 2, fiscalBilling: 'addon' } },
  { code: 'clinic_corp', audience: 'CLINIC', name: 'Corp', priceUsd: 70, commissionRate: 0.06, maxSpecialists: null, isDefault: false, sortOrder: 2,
    highlight: 'Multisede Top', features: { emergencyMap: 'Pin + banner', jobs: 'unlimited', fiscalBilling: true } },
];

try {
  let created = 0;
  for (const plan of PLANS) {
    const exists = await p.plan.findUnique({ where: { code: plan.code } });
    if (exists) { console.log('=  ya existe:', plan.code); continue; }
    await p.plan.create({ data: { id: randomUUID(), ...plan } });
    created++;
    console.log('+  creado:', plan.code);
  }
  console.log(`✅ Catálogo listo (${created} nuevos, ${PLANS.length - created} existentes).`);
} catch (e) {
  console.error('❌ Falló seed de planes:', e.message.split('\n')[0]);
  process.exit(1);
} finally {
  await p.$disconnect();
}
