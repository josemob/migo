import { prisma } from '../src/config/prisma';

async function main() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "manuallyUnavailable" BOOLEAN NOT NULL DEFAULT false;`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "unavailableUntil" TIMESTAMP(3);`,
  );
  const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'Clinic' AND column_name IN ('manuallyUnavailable','unavailableUntil') ORDER BY column_name;`,
  );
  console.log('columnas presentes:', cols.map((c) => c.column_name).join(', '));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
