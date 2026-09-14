import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { ApiError } from '../../utils/ApiError';
import { env } from '../../config/env';

/**
 * Geocodificación con OpenStreetMap (Nominatim). Gratis y sin API key.
 *
 * Va por el backend, no por el navegador, por tres razones:
 *  - Nominatim exige un User-Agent identificable y limita a ~1 req/seg por IP.
 *    Desde el navegador cada usuario pegaría por su cuenta y nos arriesgamos a
 *    que bloqueen el servicio.
 *  - Cacheamos: las mismas búsquedas se repiten mucho al teclear.
 *  - Si algún día cambiamos a Google Places, solo se toca este archivo.
 */
const router = Router();
router.use(authenticate);

const NOMINATIM = 'https://nominatim.openstreetmap.org';
// La política de uso de Nominatim exige identificar la aplicación con un
// contacto real: es por ahí por donde avisan antes de bloquear. Va el dominio
// público de Migo, no un correo inventado.
const UA = `MigoApp/1.0 (panel de clinicas; ${env.APP_PUBLIC_URL})`;
// Sesgamos los resultados a Venezuela: es donde opera Migo.
const COUNTRY = 've';

export interface Place {
  /** Línea principal de la sugerencia: el sitio o la calle. */
  label: string;
  /** Línea secundaria: el resto del contexto (urbanización, ciudad, estado). */
  context?: string;
  lat: number;
  lng: number;
  address?: string; // calle + número
  city?: string;
  state?: string;
}

// ── Caché en memoria ────────────────────────────────────────────────────────
// Suficiente para el volumen del panel; se pierde al reiniciar y no pasa nada.
const TTL_MS = 60 * 60 * 1000; // 1 hora
const MAX_ENTRIES = 500;
const cache = new Map<string, { at: number; value: unknown }>();

function cacheGet(key: string): unknown | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key: string, value: unknown) {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value });
}

// ── Cliente Nominatim ───────────────────────────────────────────────────────
async function nominatim(path: string, params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams({ format: 'jsonv2', 'accept-language': 'es', ...params });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${NOMINATIM}${path}?${qs}`, {
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) throw ApiError.conflict('El servicio de mapas no respondió. Intenta de nuevo.');
    return await res.json();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw ApiError.conflict('No se pudo consultar el servicio de mapas.');
  } finally {
    clearTimeout(timer);
  }
}

/** Arma una dirección legible a partir de las partes que devuelve Nominatim. */
function toPlace(raw: unknown): Place | null {
  const r = raw as {
    lat?: string;
    lon?: string;
    display_name?: string;
    name?: string;
    address?: Record<string, string>;
  };
  const lat = Number(r?.lat);
  const lng = Number(r?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const a = r.address ?? {};
  const street = [a.road, a.house_number].filter(Boolean).join(' ');
  const barrio = a.neighbourhood || a.suburb || a.quarter;
  const city = a.city || a.town || a.village || a.municipality || a.county;
  const state = a.state;

  // display_name trae la jerarquía completa ("Sambil, Av. Libertador, Chacao,
  // Distrito Metropolitano, Miranda, 1060, Venezuela"): demasiado para una línea.
  // Lo partimos: lo primero identifica el sitio, el resto ubica. Se recorta el
  // país y el código postal, que no aportan nada dentro de Venezuela.
  const parts = (r.display_name ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const trimmed = parts.filter((p) => p !== 'Venezuela' && !/^\d{4}$/.test(p));
  const label = trimmed[0] ?? r.name ?? [street, barrio, city].filter(Boolean).join(', ');
  const context = trimmed.slice(1, 4).join(', ') || undefined;

  return {
    label,
    context,
    lat,
    lng,
    address: [street || r.name, barrio].filter(Boolean).join(', ') || undefined,
    city: city || undefined,
    state: state || undefined,
  };
}

// GET /geocode/search?q=... -> sugerencias mientras se escribe
router.get(
  '/search',
  validate({ query: z.object({ q: z.string().min(3).max(200) }) }),
  asyncHandler(async (req, res) => {
    const q = String((req.query as { q: string }).q).trim();
    const key = `s:${q.toLowerCase()}`;
    const cached = cacheGet(key);
    if (cached) return res.json({ data: cached, cached: true });

    const raw = await nominatim('/search', {
      q,
      countrycodes: COUNTRY,
      addressdetails: '1',
      limit: '6',
    });
    const data = (Array.isArray(raw) ? raw : []).map(toPlace).filter((p): p is Place => p !== null);
    cacheSet(key, data);
    res.json({ data, cached: false });
  }),
);

// GET /geocode/reverse?lat=&lng= -> dirección de un punto (al arrastrar el pin)
router.get(
  '/reverse',
  validate({
    query: z.object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { lat, lng } = req.query as unknown as { lat: number; lng: number };
    // Redondeamos a ~11 m para que arrastrar el pin no genere una llamada por píxel.
    const key = `r:${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = cacheGet(key);
    if (cached) return res.json({ place: cached, cached: true });

    const raw = await nominatim('/reverse', {
      lat: String(lat),
      lon: String(lng),
      addressdetails: '1',
      zoom: '18',
    });
    const place = toPlace(raw);
    if (place) cacheSet(key, place);
    res.json({ place, cached: false });
  }),
);

export default router;
