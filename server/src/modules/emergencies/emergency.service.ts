import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import { distanceKm, etaMinutes } from '../../lib/geo';
import { bus, EMERGENCY_NEW, EMERGENCY_UPDATE } from '../../lib/events';
import { sendPush } from '../push/push.service';
import { runTriage, quickTriage } from './triage.service';

const BROADCAST_RADIUS_KM = 15;
const MAX_CLINICS = 10;
const MAX_INDEPENDENT_VETS = 10;
// Especialidades que siempre califican para cualquier urgencia (generalistas).
const GENERALIST_SPECIALTIES = ['Medicina general', 'Emergencias y cuidados intensivos'];
// Una urgencia que nadie aceptó se cierra sola pasados estos minutos.
const UNATTENDED_TIMEOUT_MIN = 20;

// Datos del dueño + mascota que ve el profesional al recibir una urgencia.
const vetEmergencyInclude = {
  pet: {
    include: {
      owner: { select: { id: true, fullName: true, phone: true } }, // id para iniciar la videollamada
      allergies: true,
      conditions: { where: { isActive: true } },
    },
  },
} as const;

/**
 * Vets INDEPENDIENTES elegibles para una urgencia (Fase C): verificados, sin clínica,
 * con suscripción de telemedicina ACTIVE y ubicación de servicio; cuya especialidad
 * califique (match exacto, generalista, o sin especialidad declarada) y cuyo radio de
 * servicio propio cubra la ubicación de la urgencia. Ordenados por cercanía.
 */
async function findEligibleIndependentVets(
  origin: { lat: number; lng: number },
  requiredSpecialty: string | null,
) {
  const vets = await prisma.vetProfile.findMany({
    where: {
      verificationStatus: 'VERIFIED',
      serviceLat: { not: null },
      serviceLng: { not: null },
      user: { staffProfile: { is: null }, vetSubscription: { status: 'ACTIVE' } },
    },
    select: { id: true, userId: true, specialty: true, serviceLat: true, serviceLng: true, serviceRadiusKm: true },
  });

  const specialtyQualifies = (specialty: string | null) => {
    if (!requiredSpecialty) return true; // sin especialidad sugerida → todos
    // El vet puede tener varias especialidades separadas por coma.
    const list = (specialty ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return true; // sin especialidad declarada → generalista
    return list.includes(requiredSpecialty) || list.some((s) => GENERALIST_SPECIALTIES.includes(s));
  };

  return vets
    .map((v) => {
      const km = distanceKm(origin, { lat: Number(v.serviceLat), lng: Number(v.serviceLng) });
      return { id: v.id, userId: v.userId, specialty: v.specialty, radiusKm: v.serviceRadiusKm, km, eta: etaMinutes(km) };
    })
    .filter((v) => v.km <= v.radiusKm && specialtyQualifies(v.specialty)) // dentro del radio propio + especialidad
    .sort((a, b) => a.km - b.km)
    .slice(0, MAX_INDEPENDENT_VETS);
}

/**
 * Refinamiento en SEGUNDO PLANO (no bloquea la respuesta al dueño): corre el triaje con IA
 * (Gemini con timeout → heurística), enriquece la urgencia (gravedad, resumen, primeros
 * auxilios, especialidad) y rutea a los vets INDEPENDIENTES por especialidad + radio.
 */
async function refineTriageAndRouteVets(
  emergencyId: string,
  triageInput: Parameters<typeof runTriage>[0],
  origin: { lat: number; lng: number },
  petName: string,
  symptoms: string,
) {
  const triage = await runTriage(triageInput);

  // Enriquecer el triaje SOLO si la urgencia sigue en curso (no aceptada/cancelada)
  await prisma.emergency.updateMany({
    where: { id: emergencyId, status: { in: ['TRIAGING', 'BROADCASTING'] } },
    data: {
      triageLevel: triage.triageLevel,
      aiSummary: triage.aiSummary,
      aiFirstAid: triage.aiFirstAid,
      requiredSpecialty: triage.requiredSpecialty,
    },
  });

  // Rutear a vets independientes por especialidad + radio
  const nearbyVets = await findEligibleIndependentVets(origin, triage.requiredSpecialty);
  if (nearbyVets.length) {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.emergencyAlert.createMany({
      data: nearbyVets.map((v) => ({
        emergencyId,
        vetProfileId: v.id,
        distanceKm: Number(v.km.toFixed(2)),
        etaMinutes: v.eta,
        expiresAt,
      })),
      skipDuplicates: true,
    });
    try {
      const critical = triage.triageLevel === 'RED';
      const title = critical ? '🚨 Emergencia crítica cerca' : '🚑 Nueva emergencia cerca';
      const body = `${petName}: ${symptoms}`.replace(/\s+/g, ' ').trim().slice(0, 140);
      await Promise.all(
        nearbyVets.map((v) => sendPush(v.userId, { title, body, data: { type: 'emergency', emergencyId, triageLevel: triage.triageLevel } })),
      );
    } catch (e) {
      console.error('[emergency] push a vets independientes falló', e);
    }
  }

  // Refrescar los paneles de clínica con el triaje enriquecido (SSE)
  const clinicAlerts = await prisma.emergencyAlert.findMany({ where: { emergencyId, clinicId: { not: null } }, select: { clinicId: true } });
  const clinicIds = [...new Set(clinicAlerts.map((a) => a.clinicId).filter((c): c is string => !!c))];
  for (const clinicId of clinicIds) bus.emit(EMERGENCY_UPDATE, { clinicId, emergencyId });

  // Si nadie quedó alertado (ni clínicas ni vets), expira la urgencia
  const total = await prisma.emergencyAlert.count({ where: { emergencyId } });
  if (total === 0) {
    await prisma.emergency.updateMany({ where: { id: emergencyId, status: { in: ['TRIAGING', 'BROADCASTING'] } }, data: { status: 'EXPIRED' } });
  }
}

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
    // Anti-duplicado: si el dueño ya tiene una emergencia en curso, la devuelve
    // en lugar de crear otra (el cliente navega al seguimiento de la existente).
    const active = await prisma.emergency.findFirst({
      where: { ownerId, status: { in: ['TRIAGING', 'BROADCASTING', 'ACCEPTED', 'EN_ROUTE'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (active) {
      return { emergency: active, triage: null, broadcastedTo: 0, existing: true };
    }

    const pet = await prisma.pet.findFirst({
      where: { id: input.petId, ownerId },
      include: {
        allergies: { select: { substance: true } },
        conditions: { where: { isActive: true }, select: { name: true } },
      },
    });
    if (!pet) throw ApiError.notFound('Mascota no encontrada');

    // 1) Crear la urgencia
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

    const ageYears = pet.birthDate
      ? Math.floor((Date.now() - pet.birthDate.getTime()) / (365.25 * 86400000))
      : null;
    const triageInput = {
      species: pet.species,
      breed: pet.breed,
      symptoms: input.symptoms,
      ageYears,
      knownAllergies: pet.allergies.map((a) => a.substance),
      conditions: pet.conditions.map((c) => c.name),
    };

    // 2) Triaje RÁPIDO (heurística, instantáneo) — para difundir de inmediato, sin esperar IA
    const quick = quickTriage(triageInput);

    // 3) Clínicas cercanas (pura geolocalización, instantáneo)
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

    // 4) DIFUNDIR YA a las clínicas (con el triaje rápido); la respuesta al dueño no espera a la IA
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const [updated] = await prisma.$transaction([
      prisma.emergency.update({
        where: { id: emergency.id },
        data: {
          triageLevel: quick.triageLevel,
          aiSummary: quick.aiSummary,
          aiFirstAid: quick.aiFirstAid,
          status: 'BROADCASTING',
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

    // Push/SSE inmediato a las clínicas
    for (const c of nearby) bus.emit(EMERGENCY_NEW, { clinicId: c.clinicId, emergencyId: emergency.id });
    try {
      const clinicIds = nearby.map((c) => c.clinicId);
      if (clinicIds.length) {
        const staff = await prisma.clinicStaff.findMany({ where: { clinicId: { in: clinicIds }, isActive: true }, select: { userId: true } });
        const critical = quick.triageLevel === 'RED';
        const title = critical ? '🚨 Emergencia crítica cerca' : '🚑 Nueva emergencia cerca';
        const body = `${pet.name}: ${input.symptoms}`.replace(/\s+/g, ' ').trim().slice(0, 140);
        const targets = [...new Set(staff.map((s) => s.userId))];
        await Promise.all(
          targets.map((userId) => sendPush(userId, { title, body, data: { type: 'emergency', emergencyId: emergency.id, triageLevel: quick.triageLevel } })),
        );
      }
    } catch (e) {
      console.error('[emergency] push a clínicas falló', e);
    }

    // 5) Triaje IA + ruteo a vets INDEPENDIENTES en SEGUNDO PLANO (no bloquea la respuesta)
    void refineTriageAndRouteVets(emergency.id, triageInput, origin, pet.name, input.symptoms).catch((e) =>
      console.error('[emergency] refinamiento async falló', e),
    );

    return { emergency: updated, triage: quick, broadcastedTo: nearby.length };
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
    const clinicIds = [...new Set(emergency.alerts.map((a) => a.clinicId).filter((c): c is string => !!c))];
    for (const clinicId of clinicIds) {
      bus.emit(EMERGENCY_UPDATE, { clinicId, emergencyId: id });
    }
    return updated;
  },

  // ─── Lado VET INDEPENDIENTE (Fase C) ───────────────────────────────

  /** Urgencias en curso ruteadas a este vet independiente. */
  async listIncomingForVet(userId: string) {
    await expireStaleEmergencies().catch(() => {});
    const profile = await prisma.vetProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) return [];
    return prisma.emergencyAlert.findMany({
      where: {
        vetProfileId: profile.id,
        status: { in: ['SENT', 'SEEN', 'ACCEPTED'] },
        emergency: { status: { in: ['BROADCASTING', 'ACCEPTED', 'EN_ROUTE'] } },
      },
      include: { emergency: { include: vetEmergencyInclude } },
      orderBy: { createdAt: 'desc' },
    });
  },

  /** El vet independiente acepta una urgencia (primero en aceptar, clínica o vet, gana). */
  async acceptByVet(userId: string, alertId: string) {
    const profile = await prisma.vetProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw ApiError.forbidden('Aún no tienes perfil profesional verificado.');

    const alert = await prisma.emergencyAlert.findFirst({
      where: { id: alertId, vetProfileId: profile.id },
      include: { emergency: { include: { alerts: { select: { clinicId: true } } } } },
    });
    if (!alert) throw ApiError.notFound('Alerta no encontrada');
    if (alert.emergency.status !== 'BROADCASTING' && alert.emergency.acceptedVetProfileId !== profile.id) {
      throw ApiError.conflict('Esta urgencia ya fue tomada por otro profesional');
    }

    const result = await prisma.$transaction(async (tx) => {
      const emergency = await tx.emergency.update({
        where: { id: alert.emergencyId },
        data: { status: 'ACCEPTED', acceptedVetProfileId: profile.id, acceptedAt: new Date() },
      });
      await tx.emergencyAlert.update({
        where: { id: alert.id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });
      await tx.emergencyAlert.updateMany({
        where: { emergencyId: alert.emergencyId, id: { not: alert.id }, status: { in: ['SENT', 'SEEN'] } },
        data: { status: 'EXPIRED' },
      });
      return emergency;
    });

    // Avisa a las clínicas alertadas para que la quiten del panel (SSE)
    const clinicIds = [...new Set(alert.emergency.alerts.map((a) => a.clinicId).filter((c): c is string => !!c))];
    for (const clinicId of clinicIds) {
      bus.emit(EMERGENCY_UPDATE, { clinicId, emergencyId: alert.emergencyId });
    }
    return result;
  },
};
