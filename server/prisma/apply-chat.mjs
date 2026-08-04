/**
 * Crea (idempotente) el enum ChatSender y la tabla ChatMessage en Supabase,
 * vía el pooler de transacciones. Seguro de re-ejecutar.
 *
 *   Uso:  node prisma/apply-chat.mjs
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

const statements = [
  `DO $$ BEGIN
     CREATE TYPE "ChatSender" AS ENUM ('OWNER','CLINIC','SYSTEM');
   EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `CREATE TABLE IF NOT EXISTS "ChatMessage" (
     "id" TEXT PRIMARY KEY,
     "ownerId" TEXT NOT NULL,
     "clinicId" TEXT NOT NULL,
     "sender" "ChatSender" NOT NULL,
     "text" TEXT NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS "ChatMessage_ownerId_clinicId_createdAt_idx"
     ON "ChatMessage" ("ownerId","clinicId","createdAt")`,
];

let ok = 0;
try {
  for (const stmt of statements) {
    await p.$executeRawUnsafe(stmt);
    ok++;
    console.log(`  ✔ ${ok}/${statements.length}`);
  }
  console.log('✅ Tabla ChatMessage lista.');
} catch (e) {
  console.error(`❌ Falló en la sentencia ${ok + 1}:`, e.message.split('\n')[0]);
  process.exit(1);
} finally {
  await p.$disconnect();
}
