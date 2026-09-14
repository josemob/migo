import { prisma } from '../../config/prisma';

/**
 * Tasa oficial del BCV (Bs. por USD).
 *
 * El valor vive en PlatformConfig.bcvRate. Antes era un número fijo que nadie
 * actualizaba (quedó en 36.5 mientras la tasa real pasaba de 800), así que aquí
 * lo sincronizamos contra APIs públicas gratuitas (sin API key).
 *
 * Fuentes, en orden de preferencia. Si la primera falla se intenta la siguiente.
 */
interface Source {
  name: string;
  url: string;
  parse: (json: unknown) => { rate: number; at?: Date } | null;
}

const SOURCES: Source[] = [
  {
    name: 'dolarapi',
    url: 'https://ve.dolarapi.com/v1/dolares/oficial',
    parse: (j) => {
      const d = j as { promedio?: number; fechaActualizacion?: string };
      if (typeof d?.promedio !== 'number') return null;
      const at = d.fechaActualizacion ? new Date(d.fechaActualizacion) : undefined;
      return { rate: d.promedio, at: at && !Number.isNaN(at.getTime()) ? at : undefined };
    },
  },
  {
    name: 'pydolarve',
    url: 'https://pydolarve.org/api/v1/dollar?page=bcv',
    parse: (j) => {
      // { monitors: { usd: { price: 832.48, last_update: "..." } } }
      const d = j as { monitors?: { usd?: { price?: number; last_update?: string } } };
      const price = d?.monitors?.usd?.price;
      if (typeof price !== 'number') return null;
      return { rate: price };
    },
  },
];

/** Consulta una fuente con tiempo límite. null si falla o responde algo inesperado. */
async function fetchFrom(src: Source): Promise<{ rate: number; at?: Date } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(src.url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'MigoApp/1.0 (+https://migo.app)' },
    });
    if (!res.ok) return null;
    const parsed = src.parse(await res.json());
    // Sanidad: descarta valores absurdos (la tasa siempre es > 0 y no millones).
    if (!parsed || !Number.isFinite(parsed.rate) || parsed.rate <= 0 || parsed.rate > 10_000_000) return null;
    return parsed;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface BcvResult {
  rate: number;
  source: string | null;
  /** Cuándo sincronizamos nosotros (es lo que decide si hay que refrescar). */
  updatedAt: Date | null;
  /** Fecha de publicación de la tasa según el BCV (puede ser de días atrás). */
  rateDate: Date | null;
  /** true si se trajo un valor nuevo; false si se conservó el guardado. */
  refreshed: boolean;
}

/**
 * Trae la tasa de la primera fuente que responda y la guarda en PlatformConfig.
 * Si todas fallan, NO pisa el valor guardado (mejor una tasa vieja que ninguna).
 */
export async function refreshBcvRate(): Promise<BcvResult> {
  for (const src of SOURCES) {
    const got = await fetchFrom(src);
    if (!got) continue;
    // bcvUpdatedAt = AHORA (cuándo sincronizamos). La fecha que reporta la fuente
    // es la de publicación del BCV y va aparte: si usáramos esa para el refresco,
    // el valor se vería "viejo" siempre y llamaríamos a la API en cada carga.
    const data = { bcvRate: got.rate, bcvSource: src.name, bcvUpdatedAt: new Date(), bcvRateDate: got.at ?? null };
    const cfg = await prisma.platformConfig.upsert({
      where: { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...data },
    });
    return {
      rate: Number(cfg.bcvRate),
      source: cfg.bcvSource,
      updatedAt: cfg.bcvUpdatedAt,
      rateDate: cfg.bcvRateDate,
      refreshed: true,
    };
  }

  const cfg = await prisma.platformConfig.findUnique({ where: { id: 'singleton' } });
  return {
    rate: cfg ? Number(cfg.bcvRate) : 0,
    source: cfg?.bcvSource ?? null,
    updatedAt: cfg?.bcvUpdatedAt ?? null,
    rateDate: cfg?.bcvRateDate ?? null,
    refreshed: false,
  };
}

const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6 horas

/** ¿El valor guardado ya está viejo (o nunca se sincronizó)? */
export function isStale(updatedAt: Date | null | undefined): boolean {
  if (!updatedAt) return true;
  return Date.now() - updatedAt.getTime() > STALE_AFTER_MS;
}

/**
 * Refresca en segundo plano si está vieja. No bloquea la respuesta al panel:
 * la primera carga muestra el valor guardado y la siguiente ya trae el nuevo.
 */
export function refreshIfStale(updatedAt: Date | null | undefined): void {
  if (!isStale(updatedAt)) return;
  void refreshBcvRate().catch((e) => {
    console.error('[bcv] refresco en segundo plano falló:', e instanceof Error ? e.message : e);
  });
}
