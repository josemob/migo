/**
 * Reset de datos de un usuario para volver a probar el flujo de primer uso
 * (onboarding + registro de mascota). NO borra la cuenta: solo deja al usuario
 * con 0 mascotas, eliminando de forma transaccional todo lo dependiente.
 *
 * Buenas prácticas: transaccional (todo o nada), parametrizado, idempotente
 * (correr de nuevo no falla), y acotado a un solo usuario.
 *
 * Uso:
 *   npx tsx prisma/reset-user.ts                      # jose.mota@example.com por defecto
 *   npx tsx prisma/reset-user.ts otro@correo.com
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const email = process.argv[2] ?? 'jose.mota@example.com';

async function main() {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, fullName: true } });
  if (!user) {
    console.error(`❌ No existe un usuario con email ${email}`);
    process.exit(1);
  }

  await prisma.$transaction(async (tx) => {
    const pets = await tx.pet.findMany({ where: { ownerId: user.id }, select: { id: true } });
    const petIds = pets.map((p) => p.id);

    const emergencies = await tx.emergency.findMany({
      where: { OR: [{ ownerId: user.id }, { petId: { in: petIds } }] },
      select: { id: true },
    });
    const emergencyIds = emergencies.map((e) => e.id);

    const appts = await tx.appointment.findMany({ where: { petId: { in: petIds } }, select: { id: true } });
    const apptIds = appts.map((a) => a.id);

    const teles = await tx.teleconsult.findMany({
      where: { OR: [{ ownerId: user.id }, { petId: { in: petIds } }] },
      select: { id: true },
    });
    const teleIds = teles.map((t) => t.id);

    // Orden de borrado: hijos → padres (respetando llaves foráneas sin cascada)
    await tx.ledgerEntry.deleteMany({
      where: {
        OR: [
          { emergencyId: { in: emergencyIds } },
          { appointmentId: { in: apptIds } },
          { teleconsultId: { in: teleIds } },
        ],
      },
    });
    await tx.review.deleteMany({ where: { OR: [{ appointmentId: { in: apptIds } }, { authorId: user.id }] } });
    await tx.medicalRecord.deleteMany({ where: { petId: { in: petIds } } });
    await tx.emergency.deleteMany({ where: { id: { in: emergencyIds } } }); // cascada: emergencyAlert
    await tx.teleconsult.deleteMany({ where: { id: { in: teleIds } } });
    await tx.appointment.deleteMany({ where: { id: { in: apptIds } } });
    // cascada de Pet: allergies, conditions, vaccinations, prescriptions
    const del = await tx.pet.deleteMany({ where: { id: { in: petIds } } });

    console.log(`🧹 ${user.fullName} (${email}) reseteado: ${del.count} mascota(s) eliminada(s).`);
    console.log('   Cuenta conservada. Ahora tiene 0 mascotas → verá el registro de primer uso.');
  }, { timeout: 30000, maxWait: 10000 }); // el pooler agrega latencia por query
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
