/**
 * Migración incremental puntual: agrega las columnas del banner del dashboard
 * cliente a PlatformConfig. Idempotente (IF NOT EXISTS). Se ejecuta vía el
 * pooler de transacciones igual que apply-schema.mjs.
 *   node prisma/add-banner-columns.mjs
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const stmts = [
  `ALTER TABLE "PlatformConfig" ADD COLUMN IF NOT EXISTS "clientBannerEnabled" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "PlatformConfig" ADD COLUMN IF NOT EXISTS "clientBannerImage" TEXT`,
];

try {
  for (const s of stmts) {
    await p.$executeRawUnsafe(s);
    console.log('OK:', s.slice(0, 70));
  }
  console.log('✅ Columnas del banner aplicadas.');
} catch (e) {
  console.error('❌ Falló:', e.message.split('\n')[0]);
  process.exit(1);
} finally {
  await p.$disconnect();
}
