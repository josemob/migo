/**
 * Script ADITIVO e IDEMPOTENTE — agrega dos veterinarias más al directorio
 * SIN borrar datos existentes (a diferencia de seed.ts).
 *
 *   Ejecuta:  npx tsx prisma/add-clinics.ts
 *
 * Puede correrse varias veces sin duplicar: se identifica cada comercio por su RIF
 * (único) y cada sucursal por su organización.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const pw = () => bcrypt.hashSync('Migo1234', 10);

interface NewClinic {
  ownerEmail: string;
  ownerName: string;
  orgName: string;
  legalName: string;
  rif: string;
  clinicName: string;
  description: string;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  phone: string;
  isOpen24_7: boolean;
  acceptsEmergencies: boolean;
  plan: 'FREEMIUM' | 'PRO';
  ratingAvg: number;
  ratingCount: number;
  hours: { days: number[]; opensAt: string; closesAt: string; isOnCall?: boolean }[];
  services: {
    name: string;
    category: 'CONSULTATION' | 'VACCINATION' | 'GROOMING' | 'SURGERY' | 'LAB' | 'IMAGING' | 'DENTAL' | 'EMERGENCY' | 'DEWORMING' | 'OTHER';
    description: string;
    priceUsd: number;
    durationMin: number;
    requiresVet?: boolean;
  }[];
}

const CLINICS: NewClinic[] = [
  {
    ownerEmail: 'contacto@pawshair.com',
    ownerName: 'Administración Paws & Hair',
    orgName: 'Paws & Hair',
    legalName: 'Paws & Hair Studio C.A.',
    rif: 'J-41222333-4',
    clinicName: 'Paws & Hair Studio',
    description: 'Peluquería y spa canino especializado en cortes de raza, con estilistas profesionales certificados.',
    address: 'Calle París, Edif. Miranda, Los Palos Grandes',
    city: 'Caracas',
    state: 'Distrito Capital',
    latitude: 10.4975,
    longitude: -66.843,
    phone: '0212-2661234',
    isOpen24_7: false,
    acceptsEmergencies: false,
    plan: 'FREEMIUM',
    ratingAvg: 4.7,
    ratingCount: 85,
    hours: [
      { days: [1, 2, 3, 4, 5, 6], opensAt: '09:00', closesAt: '18:00' },
      { days: [0], opensAt: '00:00', closesAt: '00:00' }, // domingo cerrado (isOpen=false abajo)
    ],
    services: [
      { name: 'Baño y Corte Completo', category: 'GROOMING', description: 'Baño, secado, corte de raza, corte de uñas y limpieza de oídos.', priceUsd: 18, durationMin: 90 },
      { name: 'Vacuna Múltiple Canina', category: 'VACCINATION', description: 'Aplicación de vacuna polivalente con constancia sellada.', priceUsd: 16, durationMin: 15, requiresVet: true },
      { name: 'Desparasitación Integral', category: 'DEWORMING', description: 'Tratamiento interno y externo contra parásitos.', priceUsd: 12, durationMin: 20 },
    ],
  },
  {
    ownerEmail: 'contacto@petstyleboutique.com',
    ownerName: 'Administración Pet Style',
    orgName: 'Pet Style Boutique',
    legalName: 'Pet Style Boutique C.A.',
    rif: 'J-41777888-9',
    clinicName: 'Pet Style Boutique',
    description: 'Boutique de estética y salud para mascotas con servicios premium y consultas veterinarias.',
    address: 'Centro Comercial Paseo, Nivel PB, Chacao',
    city: 'Caracas',
    state: 'Miranda',
    latitude: 10.47,
    longitude: -66.879,
    phone: '0212-9552020',
    isOpen24_7: false,
    acceptsEmergencies: true,
    plan: 'PRO',
    ratingAvg: 4.5,
    ratingCount: 42,
    hours: [{ days: [0, 1, 2, 3, 4, 5, 6], opensAt: '10:00', closesAt: '19:00' }],
    services: [
      { name: 'Spa & Estética Premium', category: 'GROOMING', description: 'Tratamiento spa completo con hidratación de pelaje y aromaterapia.', priceUsd: 20, durationMin: 120 },
      { name: 'Consulta Veterinaria General', category: 'CONSULTATION', description: 'Evaluación clínica integral por veterinario colegiado.', priceUsd: 22, durationMin: 40, requiresVet: true },
      { name: 'Limpieza Dental Profesional', category: 'DENTAL', description: 'Profilaxis dental con ultrasonido bajo sedación ligera.', priceUsd: 45, durationMin: 60, requiresVet: true },
    ],
  },
];

async function main() {
  for (const c of CLINICS) {
    console.log(`\n🏢 ${c.clinicName} (${c.rif})`);

    // 1) Dueño del comercio (idempotente por email)
    const owner = await prisma.user.upsert({
      where: { email: c.ownerEmail },
      update: {},
      create: { email: c.ownerEmail, passwordHash: pw(), fullName: c.ownerName, role: 'CLINIC_ADMIN' },
    });

    // 2) Comercio (idempotente por RIF único)
    const org = await prisma.organization.upsert({
      where: { rif: c.rif },
      update: { name: c.orgName, legalName: c.legalName },
      create: {
        ownerId: owner.id,
        name: c.orgName,
        legalName: c.legalName,
        rif: c.rif,
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
      },
    });

    // 3) Sucursal (idempotente: 1 sucursal por organización de este script)
    let clinic = await prisma.clinic.findFirst({ where: { organizationId: org.id } });
    if (!clinic) {
      clinic = await prisma.clinic.create({
        data: {
          organizationId: org.id,
          name: c.clinicName,
          description: c.description,
          address: c.address,
          city: c.city,
          state: c.state,
          phone: c.phone,
          latitude: c.latitude,
          longitude: c.longitude,
          isOpen24_7: c.isOpen24_7,
          acceptsEmergencies: c.acceptsEmergencies,
          plan: c.plan,
          verificationStatus: 'VERIFIED',
          verifiedAt: new Date(),
          ratingAvg: c.ratingAvg,
          ratingCount: c.ratingCount,
        },
      });
      console.log('   ➕ Sucursal creada');
    } else {
      console.log('   ↺ Sucursal ya existía, actualizando servicios/horarios');
    }

    // 4) Horarios (reemplaza)
    await prisma.clinicHours.deleteMany({ where: { clinicId: clinic.id } });
    const hourRows = c.hours.flatMap((h) =>
      h.days.map((d) => ({
        clinicId: clinic!.id,
        dayOfWeek: d,
        opensAt: h.opensAt,
        closesAt: h.closesAt,
        isOpen: !(h.opensAt === '00:00' && h.closesAt === '00:00'),
        isOnCall: h.isOnCall ?? false,
      })),
    );
    await prisma.clinicHours.createMany({ data: hourRows });

    // 5) Servicios (reemplaza los de esta sucursal)
    await prisma.service.deleteMany({ where: { clinicId: clinic.id } });
    for (const s of c.services) {
      await prisma.service.create({
        data: {
          clinicId: clinic.id,
          name: s.name,
          category: s.category,
          description: s.description,
          priceUsd: s.priceUsd,
          durationMin: s.durationMin,
          requiresVet: s.requiresVet ?? false,
        },
      });
    }
    console.log(`   ✅ ${c.services.length} servicios · ${hourRows.length} días de horario`);
  }

  const total = await prisma.clinic.count({ where: { verificationStatus: 'VERIFIED' } });
  console.log(`\n🎉 Listo. Clínicas verificadas en el directorio: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
