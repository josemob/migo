/**
 * Seed de demostración — reproduce los datos de las pantallas Figma del
 * Vet Dashboard "Migo Clínicas · Sucursal Las Mercedes".
 *
 * ⚠️  Uso solo en desarrollo: borra y recrea los datos.
 *     Ejecuta:  npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const pw = () => bcrypt.hashSync('Migo1234', 10);
// Semana del demo: Julio 13-19, 2026
const at = (iso: string) => new Date(iso);

async function main() {
  console.log('🧹 Limpiando datos previos...');
  // Orden respetando llaves foráneas
  await prisma.ledgerEntry.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.emergencyAlert.deleteMany();
  await prisma.emergency.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.medicalRecord.deleteMany();
  await prisma.vaccination.deleteMany();
  await prisma.allergy.deleteMany();
  await prisma.petCondition.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.staffShift.deleteMany();
  await prisma.review.deleteMany();
  await prisma.service.deleteMany();
  await prisma.clinicHours.deleteMany();
  await prisma.settlementAccount.deleteMany();
  await prisma.clinicStaff.deleteMany();
  await prisma.pet.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.clinic.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  console.log('🏢 Comercio y sucursal...');
  const owner = await prisma.user.create({
    data: {
      email: 'admin@migoclinicas.com',
      passwordHash: pw(),
      fullName: 'Administración Migo Clínicas',
      role: 'CLINIC_ADMIN',
    },
  });

  const org = await prisma.organization.create({
    data: {
      ownerId: owner.id,
      name: 'Migo Clínicas',
      legalName: 'Migo Clínicas Veterinarias C.A.',
      rif: 'J-40123456-7',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
    },
  });

  const clinic = await prisma.clinic.create({
    data: {
      organizationId: org.id,
      name: 'Las Mercedes',
      description: 'Migo Clínicas Las Mercedes ofrece atención médica integral para animales de compañía las 24 horas del día.',
      address: 'Av. Principal de Las Mercedes, Edificio Migo, Caracas.',
      city: 'Caracas',
      state: 'Distrito Capital',
      latitude: 10.4806,
      longitude: -66.8564,
      isOpen24_7: true,
      acceptsEmergencies: true,
      staffCapacity: 5,
      plan: 'PRO',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
      ratingAvg: 4.8,
      ratingCount: 132,
    },
  });

  await prisma.settlementAccount.create({
    data: {
      clinicId: clinic.id,
      bankName: 'Banco Nacional de Descuento',
      accountType: 'CHECKING',
      accountLast4: '4521',
      holderName: 'Migo Clínicas Veterinarias C.A.',
      holderIdNumber: 'J-40123456-7',
      c2pEnabled: true,
    },
  });

  console.log('🕐 Horarios...');
  await prisma.clinicHours.createMany({
    data: [1, 2, 3, 4, 5].map((d) => ({ clinicId: clinic.id, dayOfWeek: d, opensAt: '08:00', closesAt: '20:00', isOnCall: true }))
      .concat([
        { clinicId: clinic.id, dayOfWeek: 6, opensAt: '08:00', closesAt: '17:00', isOnCall: false },
        { clinicId: clinic.id, dayOfWeek: 0, opensAt: '08:00', closesAt: '17:00', isOnCall: false },
      ]),
  });

  console.log('👩‍⚕️ Staff...');
  // María es veterinaria (posición VET, cuenta para servicios médicos) y a la
  // vez Admin Local de la sucursal (rol de usuario CLINIC_ADMIN para permisos).
  const maria = await prisma.user.create({
    data: { email: 'maria.perez@migoclinicas.com', passwordHash: pw(), fullName: 'Dra. María Pérez', role: 'CLINIC_ADMIN' },
  });
  const mariaStaff = await prisma.clinicStaff.create({
    data: {
      userId: maria.id, clinicId: clinic.id, position: 'VET', roleLabel: 'Admin Local',
      specialty: 'Cirugía & Medicina Interna', collegiateNumber: '4152', cmvLicense: 'CMV-4152',
      verificationStatus: 'VERIFIED', verifiedAt: new Date(),
    },
  });
  const carlos = await prisma.user.create({
    data: { email: 'carlos.ruiz@migoclinicas.com', passwordHash: pw(), fullName: 'Dr. Carlos Ruiz', role: 'VET' },
  });
  const carlosStaff = await prisma.clinicStaff.create({
    data: {
      userId: carlos.id, clinicId: clinic.id, position: 'VET',
      specialty: 'Traumatología Veterinaria', collegiateNumber: '5219', cmvLicense: 'CMV-5219',
      verificationStatus: 'VERIFIED', verifiedAt: new Date(),
    },
  });
  const ana = await prisma.user.create({
    data: { email: 'ana.lopez@migoclinicas.com', passwordHash: pw(), fullName: 'Ana López', role: 'VET' },
  });
  await prisma.clinicStaff.create({
    data: { userId: ana.id, clinicId: clinic.id, position: 'GROOMER', roleLabel: 'Estética & Grooming Profesional', verificationStatus: 'VERIFIED' },
  });
  const luisM = await prisma.user.create({
    data: { email: 'luis.martinez@migoclinicas.com', passwordHash: pw(), fullName: 'Luis Martínez', role: 'VET' },
  });
  await prisma.clinicStaff.create({
    data: { userId: luisM.id, clinicId: clinic.id, position: 'RECEPTIONIST', roleLabel: 'Atención al Cliente & Admisión de Mascotas', verificationStatus: 'VERIFIED' },
  });

  // Guardias de hoy
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await prisma.staffShift.createMany({
    data: [
      { staffId: mariaStaff.id, date: today, shift: 'MORNING', isOnCall: true },
      { staffId: carlosStaff.id, date: today, shift: 'NIGHT', isOnCall: true },
    ],
  });

  console.log('🧑 Dueños...');
  const jose = await prisma.user.create({
    data: { email: 'jose.mota@example.com', passwordHash: pw(), fullName: 'José Mota', phone: '+58 412-1234567', nationalId: 'V-19.452.123', role: 'PET_OWNER' },
  });
  const anaG = await prisma.user.create({
    data: { email: 'ana.gomez@example.com', passwordHash: pw(), fullName: 'Ana Gómez', phone: '+58 414-2223344', nationalId: 'V-18.111.222', role: 'PET_OWNER' },
  });
  const laura = await prisma.user.create({
    data: { email: 'laura.sol@example.com', passwordHash: pw(), fullName: 'Laura Sol', phone: '+58 416-5556677', nationalId: 'V-20.333.444', role: 'PET_OWNER' },
  });
  const marcos = await prisma.user.create({
    data: { email: 'marcos.pena@example.com', passwordHash: pw(), fullName: 'Marcos Peña', phone: '+58 412-7778899', nationalId: 'V-17.888.999', role: 'PET_OWNER' },
  });

  console.log('🐾 Mascotas...');
  const toddy = await prisma.pet.create({
    data: {
      ownerId: jose.id, name: 'Toddy', species: 'DOG', breed: 'Pug', sex: 'MALE',
      birthDate: at('2024-03-01'), weightKg: 8.5, bloodType: 'DEA 1.1 Positivo', status: 'CRITICAL',
      allergies: {
        create: [
          { substance: 'Penicilina', severity: 'CRITICAL', reaction: 'Reacción Anafiláctica' },
          { substance: 'Ivermectina', severity: 'SEVERE' },
        ],
      },
      conditions: { create: [{ name: 'Epilepsia idiopática en tratamiento', isActive: true }] },
      vaccinations: {
        create: [
          { vaccineName: 'Séxtuple Canina', appliedAt: at('2026-01-12'), nextDueAt: at('2027-01-12'), clinicId: clinic.id, appliedById: mariaStaff.id },
          { vaccineName: 'Rabia Canina', appliedAt: at('2026-01-12'), nextDueAt: at('2027-01-12'), clinicId: clinic.id, appliedById: mariaStaff.id },
          { vaccineName: 'Tos de Perreras', appliedAt: at('2025-06-01'), nextDueAt: at('2026-06-01'), clinicId: clinic.id, appliedById: mariaStaff.id },
        ],
      },
    },
  });
  const luna = await prisma.pet.create({
    data: { ownerId: anaG.id, name: 'Luna', species: 'CAT', breed: 'Gato Persa', sex: 'FEMALE', status: 'STABLE' },
  });
  const kira = await prisma.pet.create({
    data: { ownerId: laura.id, name: 'Kira', species: 'DOG', breed: 'Golden Retriever', sex: 'FEMALE', status: 'STABLE' },
  });
  const sasha = await prisma.pet.create({
    data: { ownerId: marcos.id, name: 'Sasha', species: 'DOG', breed: 'Husky Siberiano', sex: 'FEMALE', status: 'STABLE' },
  });

  console.log('📋 Historial y prescripciones...');
  const rec = await prisma.medicalRecord.create({
    data: {
      petId: toddy.id, clinicId: clinic.id, vetId: mariaStaff.id, visitedAt: at('2026-07-03'),
      reason: 'Control Alergia', diagnosis: 'Reacción dermatológica controlada',
      prescriptions: {
        create: [
          { petId: toddy.id, drug: 'Prednisolona 5mg', dose: '1 tab', frequency: 'c/12h', durationDays: 5, prescribedById: mariaStaff.id },
          { petId: toddy.id, drug: 'Apoquel 3.6mg', frequency: 'c/24h', prescribedById: mariaStaff.id },
        ],
      },
    },
  });
  void rec;

  console.log('📅 Servicios y citas...');
  const consulta = await prisma.service.create({
    data: { clinicId: clinic.id, name: 'Consulta Veterinaria General', category: 'CONSULTATION', description: 'Evaluación integral del estado de salud de la mascota, control de peso, chequeo clínico de oídos y temperatura.', priceUsd: 25, durationMin: 45, requiresVet: true },
  });
  await prisma.service.create({
    data: { clinicId: clinic.id, name: 'Vacunación contra la Rabia', category: 'VACCINATION', description: 'Aplicación de ampolla antirrábica obligatoria anual, incluye constancia internacional sellada por veterinario verificado.', priceUsd: 15, durationMin: 15, requiresVet: true },
  });
  await prisma.service.create({
    data: { clinicId: clinic.id, name: 'Baño + Corte de Raza Completo', category: 'GROOMING', description: 'Estética canina premium con secado, peinado, vaciado de glándulas, limpieza de oídos y perfumado hipoalergénico.', priceUsd: 35, durationMin: 90 },
  });
  await prisma.service.create({
    data: { clinicId: clinic.id, name: 'Hemograma Completo Automatizado', category: 'LAB', description: 'Procesamiento inmediato de muestra sanguínea en laboratorio interno. Conteo de plaquetas, glóbulos blancos y rojos.', priceUsd: 40, durationMin: 30, requiresVet: true },
  });

  await prisma.appointment.createMany({
    data: [
      { clinicId: clinic.id, petId: toddy.id, bookedById: jose.id, serviceId: consulta.id, vetId: mariaStaff.id, scheduledAt: at('2026-07-17T09:30:00'), status: 'CONFIRMED', reason: 'Vacuna Séxtuple de Refuerzo', priceUsd: 25 },
      { clinicId: clinic.id, petId: luna.id, bookedById: anaG.id, serviceId: consulta.id, vetId: carlosStaff.id, scheduledAt: at('2026-07-14T10:30:00'), status: 'CONFIRMED', reason: 'Grooming', priceUsd: 35 },
      { clinicId: clinic.id, petId: kira.id, bookedById: laura.id, serviceId: consulta.id, vetId: mariaStaff.id, scheduledAt: at('2026-07-15T14:00:00'), status: 'CONFIRMED', reason: 'Consulta general', priceUsd: 25 },
    ],
  });

  console.log('🚨 Urgencia activa + CPL...');
  const emergency = await prisma.emergency.create({
    data: {
      ownerId: jose.id, petId: toddy.id,
      symptoms: 'Dificultad respiratoria aguda tras ingesta de cuerpo extraño (posible obstrucción de tráquea).',
      triageLevel: 'RED',
      aiSummary: 'Dificultad respiratoria aguda tras ingesta de cuerpo extraño.',
      aiFirstAid: 'Mantener vías aéreas despejadas, no inducir vómito, trasladar de inmediato.',
      latitude: 10.4812, longitude: -66.8571,
      status: 'EN_ROUTE', acceptedClinicId: clinic.id, acceptedAt: new Date(),
    },
  });
  await prisma.emergencyAlert.create({
    data: { emergencyId: emergency.id, clinicId: clinic.id, status: 'ACCEPTED', distanceKm: 1.2, etaMinutes: 4, respondedAt: new Date() },
  });

  // Dos leads CPL ya atendidos (reporte de finanzas)
  const kiraEmergency = await prisma.emergency.create({
    data: { ownerId: laura.id, petId: kira.id, symptoms: 'Golpe de calor', triageLevel: 'ORANGE', status: 'ATTENDED', acceptedClinicId: clinic.id, acceptedAt: at('2026-07-15T12:00:00'), attendedAt: at('2026-07-15T12:20:00') },
  });
  await prisma.ledgerEntry.createMany({
    data: [
      { type: 'CPL', status: 'PENDING', clinicId: clinic.id, emergencyId: emergency.id, grossUsd: 0, migoFeeUsd: 5, createdAt: at('2026-07-17T10:00:00') },
      { type: 'CPL', status: 'PENDING', clinicId: clinic.id, emergencyId: kiraEmergency.id, grossUsd: 0, migoFeeUsd: 5, createdAt: at('2026-07-15T12:30:00') },
    ],
  });

  console.log('✅ Seed completado.');
  console.log('   Login demo (Admin Local): maria.perez@migoclinicas.com / Migo1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
