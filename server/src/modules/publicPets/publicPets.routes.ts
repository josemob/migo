import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { rateLimit } from '../../middleware/rateLimit';
import { ApiError } from '../../utils/ApiError';
import { PUBLIC_CODE_RE, normalizePublicCode } from '../../utils/publicCode';
import { sendPush } from '../push/push.service';

/**
 * Rutas públicas de la placa QR. SIN sesión: las usa quien encontró a una
 * mascota desde migopet.app/m/:code, con la cámara de cualquier teléfono.
 *
 * Regla de privacidad: el teléfono del dueño NUNCA sale de aquí, salvo que la
 * mascota esté en modo extraviado Y el dueño haya elegido mostrarlo. Un QR
 * pegado a un collar es público para siempre; con nombre + teléfono a la vista,
 * el "te tengo a tu perro, manda plata" se vuelve trivial.
 */
const router = Router();

const codeParam = z.object({
  code: z
    .string()
    .transform(normalizePublicCode)
    .refine((c) => PUBLIC_CODE_RE.test(c), 'Código inválido'),
});

// Holgado para lectura (alguien que recarga la página), estricto para avisar.
const readLimit = rateLimit({ windowMs: 60_000, max: 60 });
const reportLimit = rateLimit({ windowMs: 10 * 60_000, max: 5 });

// Además del límite por IP: tope de avisos por mascota, para que nadie pueda
// bombardear de notificaciones a un dueño cambiando de red.
const MAX_REPORTS_PER_PET = 5;
const REPORT_WINDOW_MS = 10 * 60_000;

const firstName = (full?: string | null) => (full ?? '').trim().split(/\s+/)[0] || null;

// GET /public/pets/:code -> ficha pública de la placa
router.get(
  '/pets/:code',
  readLimit,
  validate({ params: codeParam }),
  asyncHandler(async (req, res) => {
    const pet = await prisma.pet.findUnique({
      where: { publicCode: req.params.code },
      select: {
        publicCode: true,
        name: true,
        alias: true,
        species: true,
        breed: true,
        sex: true,
        color: true,
        size: true,
        photoUrl: true,
        lostMode: true,
        lostSince: true,
        lostMessage: true,
        specialCondition: true,
        showOwnerPhone: true,
        allergies: { select: { substance: true } },
        owner: { select: { fullName: true, phone: true } },
      },
    });
    if (!pet) throw ApiError.notFound('No encontramos ninguna mascota con ese código.');

    res.json({
      code: pet.publicCode,
      name: pet.name,
      alias: pet.alias,
      species: pet.species,
      breed: pet.breed,
      sex: pet.sex,
      color: pet.color,
      size: pet.size,
      photoUrl: pet.photoUrl,
      lostMode: pet.lostMode,
      // Lo que ayuda a cuidarla mientras vuelve a casa, solo cuando está perdida.
      lost: pet.lostMode
        ? {
            since: pet.lostSince,
            message: pet.lostMessage,
            specialCondition: pet.specialCondition,
            allergies: pet.allergies.map((a) => a.substance),
            ownerFirstName: firstName(pet.owner.fullName),
            ownerPhone: pet.showOwnerPhone ? pet.owner.phone : null,
          }
        : null,
    });
  }),
);

// POST /public/pets/:code/found -> "Avisar a su familia"
router.post(
  '/pets/:code/found',
  reportLimit,
  validate({
    params: codeParam,
    body: z.object({
      message: z.string().trim().max(500).optional(),
      contact: z.string().trim().max(80).optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const pet = await prisma.pet.findUnique({
      where: { publicCode: req.params.code },
      select: { id: true, name: true, ownerId: true },
    });
    if (!pet) throw ApiError.notFound('No encontramos ninguna mascota con ese código.');

    const recent = await prisma.petFoundReport.count({
      where: { petId: pet.id, createdAt: { gte: new Date(Date.now() - REPORT_WINDOW_MS) } },
    });
    if (recent >= MAX_REPORTS_PER_PET) {
      throw ApiError.tooMany('Su familia ya recibió varios avisos hace poco. Intenta de nuevo en unos minutos.');
    }

    const { message, contact, lat, lng } = req.body as {
      message?: string; contact?: string; lat?: number; lng?: number;
    };
    // Solo guardamos la ubicación si vienen las dos coordenadas.
    const hasLocation = typeof lat === 'number' && typeof lng === 'number';

    const report = await prisma.petFoundReport.create({
      data: {
        petId: pet.id,
        message: message || null,
        contact: contact || null,
        lat: hasLocation ? lat : null,
        lng: hasLocation ? lng : null,
      },
      select: { id: true },
    });

    // sendPush nunca lanza: si FCM falla, el aviso igual queda guardado.
    await sendPush(pet.ownerId, {
      title: `Alguien encontró a ${pet.name}`,
      body: message ? message.slice(0, 140) : 'Toca para ver el aviso y dónde está.',
      data: { type: 'PET_FOUND', petId: pet.id, reportId: report.id },
    });

    res.status(201).json({ ok: true });
  }),
);

export default router;
