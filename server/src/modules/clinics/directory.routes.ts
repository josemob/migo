import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { ApiError } from '../../utils/ApiError';
import { distanceKm } from '../../lib/geo';

const router = Router();
router.use(authenticate);

const SERVICE_CATEGORIES = [
  'CONSULTATION', 'VACCINATION', 'GROOMING', 'SURGERY', 'LAB',
  'IMAGING', 'DENTAL', 'EMERGENCY', 'DEWORMING', 'OTHER',
] as const;

// Hora local de Venezuela (UTC-4, sin horario de verano).
function venezuelaNow(): { day: number; min: number } {
  const ve = new Date(Date.now() - 4 * 60 * 60 * 1000);
  return { day: ve.getUTCDay(), min: ve.getUTCHours() * 60 + ve.getUTCMinutes() };
}
function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
}
type DayHours = { dayOfWeek: number; opensAt: string; closesAt: string; isOpen: boolean };
// Deriva si la clínica está abierta AHORA, la hora de cierre (si abierta) o la próxima apertura.
function computeOpen(isOpen24_7: boolean, hours: DayHours[]) {
  if (isOpen24_7) return { openNow: true as boolean | null, closesAt: null as string | null, opensAt: null as string | null };
  if (!hours || hours.length === 0) return { openNow: null as boolean | null, closesAt: null, opensAt: null }; // sin horario => desconocido
  const { day, min } = venezuelaNow();
  const today = hours.find((h) => h.dayOfWeek === day);
  if (today && today.isOpen) {
    const o = hhmmToMin(today.opensAt);
    const c = hhmmToMin(today.closesAt);
    const open = c > o ? min >= o && min < c : min >= o || min < c; // soporta horario nocturno
    if (open) return { openNow: true, closesAt: today.closesAt, opensAt: null };
  }
  // Cerrada: buscar la próxima apertura (hoy más tarde, o el siguiente día con atención).
  for (let i = 0; i < 7; i++) {
    const d = (day + i) % 7;
    const h = hours.find((x) => x.dayOfWeek === d && x.isOpen);
    if (!h) continue;
    if (i === 0 && min < hhmmToMin(h.opensAt)) return { openNow: false, closesAt: null, opensAt: h.opensAt };
    if (i > 0) return { openNow: false, closesAt: null, opensAt: h.opensAt };
  }
  return { openNow: false, closesAt: null, opensAt: null };
}

// GET /clinics?lat=&lng=&city=&q=&category=  -> directorio (ordenado por cercanía si hay coords)
// Sin category => todas las clínicas. Con category => solo las que ofrecen ese servicio.
router.get(
  '/',
  validate({
    query: z.object({
      lat: z.coerce.number().optional(),
      lng: z.coerce.number().optional(),
      city: z.string().optional(),
      q: z.string().optional(),
      category: z.enum(SERVICE_CATEGORIES).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { lat, lng, city, q, category } = req.query as {
      lat?: number; lng?: number; city?: string; q?: string; category?: (typeof SERVICE_CATEGORIES)[number];
    };

    const clinics = await prisma.clinic.findMany({
      where: {
        verificationStatus: 'VERIFIED',
        city: city ? { equals: city, mode: 'insensitive' } : undefined,
        // Filtro por servicio: solo clínicas con al menos un servicio activo de esa categoría
        services: category ? { some: { category, isActive: true } } : undefined,
        OR: q
          ? [
              { name: { contains: q, mode: 'insensitive' } },
              { organization: { name: { contains: q, mode: 'insensitive' } } },
            ]
          : undefined,
      },
      select: {
        id: true, name: true, address: true, city: true, phone: true,
        logoUrl: true, coverUrl: true, latitude: true, longitude: true,
        isOpen24_7: true, acceptsEmergencies: true, ratingAvg: true, ratingCount: true, plan: true,
        manuallyUnavailable: true, unavailableUntil: true,
        organization: { select: { name: true } },
        _count: { select: { services: true } },
        services: { where: { isActive: true }, select: { priceUsd: true, category: true } },
        hours: { select: { dayOfWeek: true, opensAt: true, closesAt: true, isOpen: true } },
      },
      take: 100,
    });

    const now = Date.now();
    let data = clinics.map((c) => {
      const { services, hours, manuallyUnavailable, unavailableUntil, ...rest } = c;
      // Precio base "Desde $X": mínimo entre los servicios relevantes al filtro (o todos si no hay filtro)
      const relevant = category ? services.filter((s) => s.category === category) : services;
      const prices = relevant.map((s) => Number(s.priceUsd)).filter((n) => !Number.isNaN(n));
      const base = computeOpen(c.isOpen24_7, hours);
      // Cierre manual temporal: fuerza "Cerrado" hasta unavailableUntil (si no ha expirado)
      const overrideActive = manuallyUnavailable && !!unavailableUntil && unavailableUntil.getTime() > now;
      const openInfo = overrideActive ? { openNow: false, closesAt: null, opensAt: base.opensAt } : base;
      return {
        ...rest,
        ...openInfo,
        categories: Array.from(new Set(services.map((s) => s.category))),
        fromPriceUsd: prices.length ? Math.min(...prices) : null,
        distanceKm:
          lat != null && lng != null && c.latitude != null && c.longitude != null
            ? Number(distanceKm({ lat, lng }, { lat: Number(c.latitude), lng: Number(c.longitude) }).toFixed(2))
            : null,
      };
    });

    // Orden: Pro primero, luego por cercanía (si hay), luego rating
    data = data.sort((a, b) => {
      if (a.plan !== b.plan) return a.plan === 'PRO' ? -1 : 1;
      if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
      return Number(b.ratingAvg) - Number(a.ratingAvg);
    });

    res.json({ data });
  }),
);

// GET /clinics/:id -> perfil público con servicios y horarios
router.get(
  '/:id',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const clinic = await prisma.clinic.findFirst({
      where: { id: req.params.id, verificationStatus: 'VERIFIED' },
      select: {
        id: true, name: true, description: true, address: true, city: true, phone: true,
        logoUrl: true, coverUrl: true, latitude: true, longitude: true,
        isOpen24_7: true, acceptsEmergencies: true, ratingAvg: true, ratingCount: true,
        organization: { select: { name: true } },
        hours: { orderBy: { dayOfWeek: 'asc' } },
        services: {
          where: { isActive: true },
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
        },
        reviews: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: { rating: true, comment: true, createdAt: true, author: { select: { fullName: true } } },
        },
      },
    });
    if (!clinic) throw ApiError.notFound('Clínica no encontrada');
    res.json(clinic);
  }),
);

export default router;
