/**
 * Aplica el esquema a la base de datos ejecutando el SQL de la migración
 * sentencia por sentencia a través del pooler de transacciones (DATABASE_URL).
 *
 * Por qué existe: el session pooler (5432) de este proyecto Supabase no acepta
 * el handshake de Postgres, así que `prisma migrate deploy` / `db push` no
 * funcionan. El pooler de transacciones (6543) sí funciona por-sentencia, que
 * es lo que hace este script.
 *
 * Uso:  npm run db:apply                        -> esquema completo (0_init, base vacía)
 *       npm run db:apply -- <ruta/migration.sql> -> una migración incremental
 *
 * Flujo al cambiar el schema de una base que ya tiene datos:
 *   1) Diff contra el schema del último commit, sin tocar la base:
 *        git show HEAD:server/prisma/schema.prisma > old.prisma
 *        npx prisma migrate diff --from-schema-datamodel old.prisma --to-schema-datamodel prisma/schema.prisma --script
 *      Guarda la salida en prisma/migrations/<n>_<nombre>/migration.sql
 *   2) npm run db:apply -- prisma/migrations/<n>_<nombre>/migration.sql
 *   3) npm run db:sql   (regenera 0_init para que siga describiendo el esquema completo)
 *
 * OJO: correr 0_init sobre una base con datos falla en la primera sentencia
 * (CREATE TABLE de una tabla que ya existe). Para producción, siempre incremental.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';

const MIGRATION = process.argv[2]
  ? pathToFileURL(resolve(process.argv[2]))
  : new URL('./migrations/0_init/migration.sql', import.meta.url);
const p = new PrismaClient();

const statements = readFileSync(MIGRATION, 'utf8')
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`Aplicando ${statements.length} sentencias de ${MIGRATION.pathname} vía pooler de transacciones...`);
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
