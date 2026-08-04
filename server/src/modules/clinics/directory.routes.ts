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
        organization: { select: { name: true } },
        _count: { select: { services: true } },
        services: { where: { isActive: true }, select: { priceUsd: true, category: true } },
      },
      take: 100,
    });

    let data = clinics.map((c) => {
      const { services, ...rest } = c;
      // Precio base "Desde $X": mínimo entre los servicios relevantes al filtro (o todos si no hay filtro)
      const relevant = category ? services.filter((s) => s.category === category) : services;
      const prices = relevant.map((s) => Number(s.priceUsd)).filter((n) => !Number.isNaN(n));
      return {
        ...rest,
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
