/**
 * Migración incremental: catálogo de planes (Plan) + enum PlanAudience + columnas de
 * asignación (planId/pendingPlanId) en Clinic y VetSubscription. Idempotente.
 *   node prisma/add-plan-system.mjs
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const stmts = [
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlanAudience') THEN CREATE TYPE "PlanAudience" AS ENUM ('VET','CLINIC'); END IF; END $$;`,
  `CREATE TABLE IF NOT EXISTS "Plan" (
     "id" TEXT PRIMARY KEY,
     "audience" "PlanAudience" NOT NULL,
     "code" TEXT NOT NULL UNIQUE,
     "name" TEXT NOT NULL,
     "priceUsd" DECIMAL(10,2) NOT NULL DEFAULT 0,
     "commissionRate" DECIMAL(4,3) NOT NULL,
     "billingPeriod" TEXT NOT NULL DEFAULT 'MONTHLY',
     "maxPatients" INTEGER,
     "maxSpecialists" INTEGER,
     "features" JSONB,
     "highlight" TEXT,
     "sortOrder" INTEGER NOT NULL DEFAULT 0,
     "isActive" BOOLEAN NOT NULL DEFAULT true,
     "isDefault" BOOLEAN NOT NULL DEFAULT false,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS "Plan_audience_isActive_idx" ON "Plan" ("audience","isActive")`,
  `ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "planId" TEXT`,
  `ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "pendingPlanId" TEXT`,
  `ALTER TABLE "VetSubscription" ADD COLUMN IF NOT EXISTS "planId" TEXT`,
  `ALTER TABLE "VetSubscription" ADD COLUMN IF NOT EXISTS "pendingPlanId" TEXT`,
];

try {
  for (const s of stmts) {
    await p.$executeRawUnsafe(s);
    console.log('OK:', s.slice(0, 60).replace(/\s+/g, ' '));
  }
  console.log('✅ Sistema de planes aplicado.');
} catch (e) {
  console.error('❌ Falló:', e.message.split('\n')[0]);
  process.exit(1);
} finally {
  await p.$disconnect();
}
