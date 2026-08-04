/**
 * Crea (idempotente) el enum ChatUrgency y la tabla ChatSummary en Supabase.
 * Seguro de re-ejecutar.  Uso:  node prisma/apply-chat-summary.mjs
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

const statements = [
  `DO $$ BEGIN
     CREATE TYPE "ChatUrgency" AS ENUM ('CRITICA','MODERADA','BAJA');
   EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `CREATE TABLE IF NOT EXISTS "ChatSummary" (
     "id" TEXT PRIMARY KEY,
     "ownerId" TEXT NOT NULL,
     "petId" TEXT,
     "consultationReason" TEXT NOT NULL,
     "symptoms" TEXT[] NOT NULL DEFAULT '{}',
     "durationOfSymptoms" TEXT,
     "perceivedUrgency" "ChatUrgency" NOT NULL,
     "possibleTriggers" TEXT,
     "firstAidGiven" TEXT[] NOT NULL DEFAULT '{}',
     "recommendedAction" TEXT NOT NULL,
     "keyObservationsForVet" TEXT NOT NULL,
     "source" TEXT NOT NULL DEFAULT 'gemini',
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS "ChatSummary_ownerId_createdAt_idx" ON "ChatSummary" ("ownerId","createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ChatSummary_petId_idx" ON "ChatSummary" ("petId")`,
];

let ok = 0;
try {
  for (const stmt of statements) {
    await p.$executeRawUnsafe(stmt);
    ok++;
    console.log(`  ✔ ${ok}/${statements.length}`);
  }
  console.log('✅ Tabla ChatSummary lista.');
} catch (e) {
  console.error(`❌ Falló en la sentencia ${ok + 1}:`, e.message.split('\n')[0]);
  process.exit(1);
} finally {
  await p.$disconnect();
}
