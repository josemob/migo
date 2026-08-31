import { Router, type Request } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendPush } from '../push/push.service';

const router = Router();

// Verifica la firma del webhook: Stream firma el body con HMAC-SHA256(API_SECRET)
// en el header `x-signature` (hex). Requiere el rawBody capturado en app.ts.
function verifySignature(req: Request): boolean {
  const sig = req.header('x-signature');
  const secret = env.STREAM_API_SECRET;
  const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!sig || !secret || !raw) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  // Comparación en tiempo constante (evita timing attacks).
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

interface StreamMember { user_id?: string; user?: { id?: string } }
interface StreamWebhookEvent {
  type?: string;
  cid?: string;
  channel_id?: string;
  channel_type?: string;
  user?: { id?: string; name?: string };
  message?: { text?: string; user?: { id?: string; name?: string }; attachments?: unknown[] };
  members?: StreamMember[];
  channel?: { name?: string; members?: StreamMember[] };
}

// POST /api/v1/webhooks/stream -> Stream nos avisa de cada mensaje nuevo del chat.
// Enviamos push al OTRO miembro (dueño <-> clínica). El chat va directo por Stream,
// así que este webhook es el único punto donde el backend "ve" los mensajes.
router.post('/stream', asyncHandler(async (req, res) => {
  if (!verifySignature(req)) return res.status(401).json({ ok: false });
  // Responde 200 de inmediato; el push va en segundo plano (Stream reintenta si tarda).
  res.json({ ok: true });

  const event = req.body as StreamWebhookEvent;
  if (event.type !== 'message.new') return;

  const senderId = event.message?.user?.id ?? event.user?.id;
  const members = event.members ?? event.channel?.members ?? [];
  const recipientIds = members
    .map((m) => m.user_id ?? m.user?.id)
    .filter((id): id is string => !!id && id !== senderId);
  if (!recipientIds.length) return;

  const senderName = event.message?.user?.name ?? event.user?.name ?? event.channel?.name ?? 'Mensaje nuevo';
  const text = event.message?.text?.trim();
  const body = text && text.length ? text.slice(0, 140) : (event.message?.attachments?.length ? '📎 Adjunto' : 'Te envió un mensaje');
  const cid = event.cid ?? `${event.channel_type ?? 'messaging'}:${event.channel_id ?? ''}`;

  // Resuelve cada destinatario de Stream a userId(s) reales de Migo:
  //  - "clinic_<id>"  -> todo el staff activo de esa clínica
  //  - userId directo -> ese usuario (dueño o vet independiente)
  const targets = new Set<string>();
  for (const rid of recipientIds) {
    if (rid.startsWith('clinic_')) {
      const clinicId = rid.slice('clinic_'.length);
      const staff = await prisma.clinicStaff.findMany({ where: { clinicId, isActive: true }, select: { userId: true } }).catch(() => []);
      for (const s of staff) targets.add(s.userId);
    } else {
      targets.add(rid);
    }
  }
  if (senderId) targets.delete(senderId); // nunca notificar a quien envió
  await Promise.all([...targets].map((userId) =>
    sendPush(userId, { title: `💬 ${senderName}`, body, data: { type: 'chat', cid } }).catch(() => {})));
}));

export default router;
