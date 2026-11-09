import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';

// Bandeja de la campana (apps cliente y vet). Cada push que envía Migo se guarda en
// sendPush(); aquí se lista, se cuenta lo no leído y se marca como leído.
const router = Router();
router.use(authenticate);

/**
 * Filtro por app: cada app manda X-Migo-App ("client" | "vet") y solo ve sus avisos más los
 * comunes (app null). Sin el header (versiones viejas) se ve todo, como antes.
 */
function appScope(req: Request): Prisma.NotificationWhereInput {
  const h = String(req.headers['x-migo-app'] ?? '').toLowerCase();
  return h === 'client' || h === 'vet' ? { OR: [{ app: h }, { app: null }] } : {};
}

// GET /notifications/unread-count -> { count } (globo rojo de la campana)
router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const count = await prisma.notification.count({ where: { userId: req.user!.id, readAt: null, ...appScope(req) } });
    res.json({ count });
  }),
);

// GET /notifications?before=<iso> -> las 30 más recientes (paginado hacia atrás)
router.get(
  '/',
  validate({ query: z.object({ before: z.coerce.date().optional() }) }),
  asyncHandler(async (req, res) => {
    const { before } = req.query as unknown as { before?: Date };
    const rows = await prisma.notification.findMany({
      where: { userId: req.user!.id, ...appScope(req), ...(before ? { createdAt: { lt: before } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 31,
      select: { id: true, title: true, body: true, type: true, data: true, readAt: true, createdAt: true },
    });
    const page = rows.slice(0, 30);
    const unread = await prisma.notification.count({ where: { userId: req.user!.id, readAt: null, ...appScope(req) } });
    res.json({ data: page, nextBefore: rows.length > 30 ? page[page.length - 1]!.createdAt.toISOString() : null, unread });
  }),
);

// POST /notifications/read-all -> marca todas como leídas
router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null, ...appScope(req) }, data: { readAt: new Date() } });
    res.status(204).end();
  }),
);

// POST /notifications/:id/read -> marca una como leída (al tocarla)
router.post(
  '/:id/read',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.id, readAt: null },
      data: { readAt: new Date() },
    });
    res.status(204).end();
  }),
);

export default router;
