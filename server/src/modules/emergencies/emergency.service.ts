import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import { distanceKm, etaMinutes } from '../../lib/geo';
import { bus, EMERGENCY_NEW, EMERGENCY_UPDATE } from '../../lib/events';
import { sendPush } from '../push/push.service';
import { runTriage } from './triage.service';

const BROADCAST_RADIUS_KM = 15;
const MAX_CLINICS = 10;
// Una urgencia que nadie aceptó se cierra sola pasados estos minutos.
const UNATTENDED_TIMEOUT_MIN = 20;

/**
 * Cierra automáticamente las urgencias que nadie atendió: si siguen en
 * TRIAGING/BROADCASTING (ninguna clínica aceptó) pasados UNATTENDED_TIMEOUT_MIN,
 * se marcan EXPIRED, se expiran sus alertas pendientes y se refrescan los
 * paneles de las clínicas alertadas (SSE). Devuelve cuántas se cerraron.
 */
export async function expireStaleEmergencies(): Promise<number> {
  const cutoff = new Date(Date.now() - UNATTENDED_TIMEOUT_MIN * 60 * 1000);
  const stale = await prisma.emergency.findMany({
    where: { status: { in: ['TRIAGING', 'BROADCASTING'] }, createdAt: { lt: cutoff } },
    select: { id: true, alerts: { select: { clinicId: true } } },
  });
  if (!stale.length) return 0;

  const ids = stale.map((e) => e.id);
  await prisma.$transaction([
    prisma.emergency.updateMany({ where: { id: { in: ids } }, data: { status: 'EXPIRED' } }),
    prisma.emergencyAlert.updateMany({
      where: { emergencyId: { in: ids }, status: { in: ['SENT', 'SEEN'] } },
      data: { status: 'EXPIRED' },
    }),
  ]);

  // Avisa a cada clínica alertada para que la quite del panel (SSE)
  for (const e of stale) {
    for (const clinicId of new Set(e.alerts.map((a) => a.clinicId))) {
      bus.emit(EMERGENCY_UPDATE, { clinicId, emergencyId: e.id });
    }
  }
  return ids.length;
}

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

    // Push en tiempo real a las clínicas alertadas (SSE, para el panel web)
    for (const c of nearby) {
      bus.emit(EMERGENCY_NEW, { clinicId: c.clinicId, emergencyId: emergency.id });
    }

    // Notificación push a los profesionales (app vet): suena y es clicable → pantalla de alerta
    try {
      const clinicIds = nearby.map((c) => c.clinicId);
      if (clinicIds.length) {
        const staff = await prisma.clinicStaff.findMany({
          where: { clinicId: { in: clinicIds }, isActive: true },
          select: { userId: true },
        });
        const critical = triage.triageLevel === 'RED';
        const title = critical ? '🚨 Emergencia crítica cerca' : '🚑 Nueva emergencia cerca';
        const body = `${pet.name}: ${input.symptoms}`.replace(/\s+/g, ' ').trim().slice(0, 140);
        const targets = [...new Set(staff.map((s) => s.userId))];
        await Promise.all(
          targets.map((userId) =>
            sendPush(userId, {
              title,
              body,
              data: { type: 'emergency', emergencyId: emergency.id, triageLevel: triage.triageLevel },
            }),
          ),
        );
      }
    } catch (e) {
      console.error('[emergency] push a clínicas falló', e);
    }

    return {
      emergency: updated,
      triage,
      broadcastedTo: nearby.length,
    };
  },

  async listForOwner(ownerId: string) {
    await expireStaleEmergencies().catch(() => {}); // cierra las vencidas antes de listar
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

  /** El dueño cancela su urgencia (solo antes de ser atendida). */
  async cancelByOwner(ownerId: string, id: string) {
    const emergency = await prisma.emergency.findFirst({
      where: { id, ownerId },
      include: { alerts: { select: { clinicId: true } } },
    });
    if (!emergency) throw ApiError.notFound('Urgencia no encontrada');

    const CANCELLABLE = ['TRIAGING', 'BROADCASTING', 'ACCEPTED', 'EN_ROUTE'];
    if (!CANCELLABLE.includes(emergency.status)) {
      throw ApiError.badRequest('Esta urgencia ya no se puede cancelar');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.emergency.update({ where: { id }, data: { status: 'CANCELLED' } });
      await tx.emergencyAlert.updateMany({
        where: { emergencyId: id, status: { in: ['SENT', 'SEEN', 'ACCEPTED'] } },
        data: { status: 'EXPIRED' },
      });
      return u;
    });

    // Avisa a las clínicas alertadas para que la quiten del panel (SSE)
    const clinicIds = [...new Set(emergency.alerts.map((a) => a.clinicId))];
    for (const clinicId of clinicIds) {
      bus.emit(EMERGENCY_UPDATE, { clinicId, emergencyId: id });
    }
    return updated;
  },
};
