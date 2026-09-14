// Agrega el rastreo de la tasa BCV a PlatformConfig: de dónde se trajo y cuándo.
// Idempotente: se puede correr varias veces sin romper nada.
//
//   node prisma/add-bcv-tracking.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STATEMENTS = [
  `ALTER TABLE "PlatformConfig" ADD COLUMN IF NOT EXISTS "bcvSource" TEXT`,
  `ALTER TABLE "PlatformConfig" ADD COLUMN IF NOT EXISTS "bcvUpdatedAt" TIMESTAMP(3)`,
  `ALTER TABLE "PlatformConfig" ADD COLUMN IF NOT EXISTS "bcvRateDate" TIMESTAMP(3)`,
];

async function main() {
  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
    console.log('OK ->', sql);
  }

  // Asegura que exista la fila singleton (el panel la crea al vuelo, pero así
  // el primer refresco de la tasa no depende de que alguien abra Configuración).
  await prisma.$executeRawUnsafe(
    `INSERT INTO "PlatformConfig" ("id", "updatedAt") VALUES ('singleton', NOW())
     ON CONFLICT ("id") DO NOTHING`,
  );
  console.log('OK -> fila singleton asegurada');
}

main()
  .then(() => console.log('\nListo.'))
  .catch((e) => {
    console.error('Falló:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
