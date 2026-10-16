import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';

/**
 * Limitador en memoria por IP, para las rutas públicas (sin sesión).
 *
 * Render corre una sola instancia, así que no hace falta Redis. Si algún día se
 * escala a varias, el límite pasa a ser por instancia: más laxo, no roto.
 * Depende de `app.set('trust proxy', 1)` para que req.ip sea el del cliente y
 * no el del proxy de Render (si no, todos compartirían el mismo cupo).
 */
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip ?? 'desconocida';

    // Poda ocasional para que el mapa no crezca sin límite.
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }

    const h = hits.get(key);
    if (!h || h.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (h.count >= max) {
      res.setHeader('Retry-After', String(Math.ceil((h.resetAt - now) / 1000)));
      return next(ApiError.tooMany());
    }
    h.count++;
    next();
  };
}
