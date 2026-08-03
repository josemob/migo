import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import { distanceKm, etaMinutes } from '../../lib/geo';
import { bus, EMERGENCY_NEW } from '../../lib/events';
import { runTriage } from './triage.service';

const BROADCAST_RADIUS_KM = 15;
const MAX_CLINICS = 10;

interface CreateInput {
  petId: string;
  symptoms: string;
  photoUrls?: string[];
  latitude: number;
  longitude: number;
}

export const emergencyService = {
  /** Botón de pánico: crea la urgencia, la triajea con IA y la difunde a clínicas cercanas. */
  async create(ownerId: string, input: CreateInput) {
    const pet = await prisma.pet.findFirst({
      where: { id: input.petId, ownerId },
      include: {
        allergies: { select: { substance: true } },
        conditions: { where: { isActive: true }, select: { name: true } },
      },
    });
    if (!pet) throw ApiError.notFound('Mascota no encontrada');

    // 1) Crear la urgencia en estado de triaje
    const emergency = await prisma.emergency.create({
      data: {
        ownerId,
        petId: pet.id,
        symptoms: input.symptoms,
        photoUrls: input.photoUrls ?? undefined,
        latitude: input.latitude,
        longitude: input.longitude,
        status: 'TRIAGING',
      },
    });

    // 2) Triaje con Migo AI (Gemini o heurística)
    const ageYears = pet.birthDate
      ? Math.floor((Date.now() - pet.birthDate.getTime()) / (365.25 * 86400000))
      : null;
    const triage = await runTriage({
      species: pet.species,
      breed: pet.breed,
      symptoms: input.symptoms,
      ageYears,
      knownAllergies: pet.allergies.map((a) => a.substance),
      conditions: pet.conditions.map((c) => c.name),
    });

    // 3) Buscar clínicas candidatas y calcular distancia
    const clinics = await prisma.clinic.findMany({
      where: {
        acceptsEmergencies: true,
        radarSuspended: false,
        verificationStatus: 'VERIFIED',
        latitude: { not: null },
        longitude: { not: null },
      },
      select: { id: true, latitude: true, longitude: true },
    });

    const origin = { lat: input.latitude, lng: input.longitude };
    const nearby = clinics
      .map((c) => {
        const km = distanceKm(origin, { lat: Number(c.latitude), lng: Number(c.longitude) });
        return { clinicId: c.id, km, eta: etaMinutes(km) };
      })
      .filter((c) => c.km <= BROADCAST_RADIUS_KM)
      .sort((a, b) => a.km - b.km)
      .slice(0, MAX_CLINICS);

    // 4) Actualizar triaje + estado, y crear las alertas (broadcast)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min para responder
    const [updated] = await prisma.$transaction([
      prisma.emergency.update({
        where: { id: emergency.id },
        data: {
          triageLevel: triage.triageLevel,
          aiSummary: triage.aiSummary,
          aiFirstAid: triage.aiFirstAid,
          status: nearby.length ? 'BROADCASTING' : 'EXPIRED',
        },
      }),
      prisma.emergencyAlert.createMany({
        data: nearby.map((c) => ({
          emergencyId: emergency.id,
          clinicId: c.clinicId,
          distanceKm: Number(c.km.toFixed(2)),
          etaMinutes: c.eta,
          expiresAt,
        })),
      }),
    ]);

    // Push en tiempo real a las clínicas alertadas (SSE)
    for (const c of nearby) {
      bus.emit(EMERGENCY_NEW, { clinicId: c.clinicId, emergencyId: emergency.id });
    }

    return {
      emergency: updated,
      triage,
      broadcastedTo: nearby.length,
    };
  },

  async listForOwner(ownerId: string) {
    return prisma.emergency.findMany({
      where: { ownerId },
      include: {
        pet: { select: { name: true, breed: true, species: true } },
        acceptedClinic: { select: { name: true, phone: true, address: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  },

  async getForOwner(ownerId: string, id: string) {
    const emergency = await prisma.emergency.findFirst({
      where: { id, ownerId },
      include: {
        pet: { select: { name: true, breed: true } },
        acceptedClinic: { select: { name: true, phone: true, address: true, latitude: true, longitude: true } },
        alerts: { select: { status: true, distanceKm: true, etaMinutes: true } },
      },
    });
    if (!emergency) throw ApiError.notFound('Urgencia no encontrada');
    return emergency;
  },
};
