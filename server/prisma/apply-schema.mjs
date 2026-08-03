/**
 * Aplica el esquema a la base de datos ejecutando el SQL de la migración
 * sentencia por sentencia a través del pooler de transacciones (DATABASE_URL).
 *
 * Por qué existe: el session pooler (5432) de este proyecto Supabase no acepta
 * el handshake de Postgres, así que `prisma migrate deploy` / `db push` no
 * funcionan. El pooler de transacciones (6543) sí funciona por-sentencia, que
 * es lo que hace este script.
 *
 * Uso:  npm run db:apply
 * Flujo al cambiar el schema:
 *   1) npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql
 *      (o genera una migración incremental con --from-schema-datasource)
 *   2) npm run db:apply
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const MIGRATION = new URL('./migrations/0_init/migration.sql', import.meta.url);
const p = new PrismaClient();

const statements = readFileSync(MIGRATION, 'utf8')
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`Aplicando ${statements.length} sentencias vía pooler de transacciones...`);
let ok = 0;
try {
  for (const stmt of statements) {
    await p.$executeRawUnsafe(stmt);
    ok++;
    if (ok % 25 === 0) console.log(`  ${ok}/${statements.length}`);
  }
  console.log(`✅ Esquema aplicado: ${ok}/${statements.length} sentencias.`);
} catch (e) {
  console.error(`❌ Falló en la sentencia ${ok + 1}/${statements.length}:`);
  console.error(statements[ok]?.slice(0, 200));
  console.error('Error:', e.message.split('\n')[0]);
  process.exit(1);
} finally {
  await p.$disconnect();
}
