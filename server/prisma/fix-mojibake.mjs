// Busca (y opcionalmente repara) texto con encoding roto en toda la base.
//
// El síntoma es el rombo con "?": U+FFFD (bytes EF BF BD). Aparece cuando un
// acento se pierde AL ESCRIBIR — típicamente al pasar texto con tildes por
// PowerShell a `npx tsx -e "..."`, que lo convierte al codepage de la consola.
// El carácter original ya no está en los bytes, así que no se puede deducir:
// hay que corregirlo a mano con el diccionario de abajo.
//
//   node prisma/fix-mojibake.mjs          -> solo reporta
//   node prisma/fix-mojibake.mjs --apply  -> aplica las correcciones conocidas
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

// Correcciones conocidas: texto roto -> texto correcto.
// Se comparan con el U+FFFD literal, por eso el �.
const FIXES = [
  ['Migo Cl�nicas Veterinarias C.A.', 'Migo Clínicas Veterinarias C.A.'],
  ['Dr. Pedro S�nchez', 'Dr. Pedro Sánchez'],
  ['Cardiolog�a', 'Cardiología'],
  // Texto para mostrar en la base de conocimiento de la IA. Ojo: el enum de
  // AiTriageRule.severity es 'CRITICA' sin tilde y no se toca.
  ['Cr�tica', 'Crítica'],
];

async function main() {
  // Todas las columnas de texto de nuestras tablas (las de Prisma, sin las
  // internas de migraciones).
  const columns = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('text', 'character varying')
      AND table_name NOT LIKE '\\_%'
    ORDER BY table_name, column_name
  `);

  let found = 0;
  let fixed = 0;
  const pending = new Set();

  for (const { table_name: table, column_name: col } of columns) {
    // ctid identifica la fila aunque la tabla no tenga columna "id"
    // (tablas puente, PlatformConfig, etc.).
    const rows = await prisma.$queryRawUnsafe(
      `SELECT ctid::text AS ctid, "${col}" AS value FROM "${table}" WHERE "${col}" LIKE '%' || U&'\\FFFD' || '%'`,
    );
    for (const row of rows) {
      found++;
      const fix = FIXES.find(([bad]) => bad === row.value);
      console.log(`${table}.${col}`);
      console.log(`   actual : ${JSON.stringify(row.value)}`);
      if (!fix) {
        pending.add(row.value);
        console.log('   -> sin corrección conocida: agrégala a FIXES');
        continue;
      }
      console.log(`   correcto: ${JSON.stringify(fix[1])}`);
      if (APPLY) {
        await prisma.$executeRawUnsafe(
          `UPDATE "${table}" SET "${col}" = $1 WHERE ctid = $2::tid`,
          fix[1],
          row.ctid,
        );
        fixed++;
        console.log('   -> corregido');
      }
    }
  }

  if (found === 0) {
    console.log('Sin mojibake en la base.');
  } else {
    if (pending.size) {
      console.log(`\nValores distintos sin corrección (${pending.size}):`);
      for (const v of pending) console.log(`  ${JSON.stringify(v)}`);
    }
    if (!APPLY) console.log(`\n${found} campo(s) rotos. Corre con --apply para repararlos.`);
    else console.log(`\n${fixed}/${found} campo(s) corregidos.`);
  }
}

main()
  .catch((e) => {
    console.error('Falló:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
