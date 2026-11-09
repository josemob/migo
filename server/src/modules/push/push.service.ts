import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

const expo = new Expo();

/** App que recibe el aviso: Migo (dueños) o Migo Vet (profesionales). */
export type PushApp = 'client' | 'vet';

/**
 * Destino por tipo de aviso. Una misma cuenta puede estar abierta en las dos apps (p. ej. un
 * tester con el mismo Gmail): sin esto, una emergencia para el vet también le sonaba en Migo
 * cliente. null = ambas apps (chat, avisos del administrador).
 */
const APP_BY_TYPE: Record<string, PushApp> = {
  emergency: 'vet',
  'appointment-request': 'vet',
  staff_invite: 'vet',
  staff_removed: 'vet',
  appointment: 'client', // al dueño; el aviso al equipo cuando el dueño cancela pasa { app: 'vet' }
  PET_FOUND: 'client',
};

/** Registra (o actualiza) un Expo push token para un usuario y la app desde la que se registró. */
export async function registerPushToken(userId: string, token: string, platform?: string, app?: PushApp) {
  if (!Expo.isExpoPushToken(token)) return;
  await prisma.pushToken.upsert({
    where: { token },
    create: { userId, token, platform, app },
    update: { userId, platform, ...(app ? { app } : {}) },
  });
}

/** Baja de un token (al cerrar sesión). Solo el dueño del token puede darlo de baja. */
export async function removePushToken(token: string, userId: string) {
  await prisma.pushToken.deleteMany({ where: { token, userId } });
}

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Envía una notificación push a todos los devices de un usuario.
 * Nunca lanza: si Expo/FCM falla, se registra el error pero no rompe el flujo.
 */
export async function sendPush(userId: string, payload: PushPayload, opts: { app?: PushApp | null } = {}) {
  const type = typeof payload.data?.type === 'string' ? payload.data.type : null;
  const app: PushApp | null = opts.app !== undefined ? opts.app : (type ? APP_BY_TYPE[type] ?? null : null);
  // Bandeja de la campana: se guarda siempre (aunque el usuario tenga las push apagadas
  // o no tenga el teléfono registrado), para que la vea al abrir la app.
  try {
    // Los mensajes de chat NO van a la campana: tienen su propio contador en la pestaña Chats
    // y llenarían la bandeja con cada mensaje.
    if (type !== 'chat') await prisma.notification.create({
      data: {
        userId,
        title: payload.title,
        body: payload.body,
        type,
        app,
        data: (payload.data ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (e) {
    console.error('[push] no se pudo guardar en la bandeja', e instanceof Error ? e.message : e);
  }
  try {
    // Respeta la preferencia del usuario: si desactivó las push, no se le envían.
    const pref = await prisma.user.findUnique({ where: { id: userId }, select: { notifyPush: true } });
    if (pref && !pref.notifyPush) return;
    // Solo los teléfonos de la app destino. Los tokens sin app (versiones viejas que no lo
    // informaban) siguen recibiendo todo, para no cortarle las emergencias a un Migo Vet viejo.
    const tokens = await prisma.pushToken.findMany({
      where: { userId, ...(app ? { OR: [{ app }, { app: null }] } : {}) },
      select: { token: true },
    });
    const messages: ExpoPushMessage[] = tokens
      .map((t) => t.token)
      .filter((t) => Expo.isExpoPushToken(t))
      .map((to) => ({ to, sound: 'default', title: payload.title, body: payload.body, data: payload.data ?? {} }));

    if (!messages.length) return;

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      // Limpia tokens inválidos (DeviceNotRegistered)
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          const bad = (chunk[i]?.to as string) ?? '';
          if (bad) void prisma.pushToken.deleteMany({ where: { token: bad } });
        }
      });
    }
  } catch (e) {
    console.error('[push] sendPush failed', e);
  }
}

/**
 * Envío masivo (marketing): manda una notificación a una lista de tokens.
 * Devuelve cuántos se enviaron OK. Limpia tokens inválidos. Nunca lanza.
 */
export async function sendBulkPush(tokens: string[], payload: PushPayload): Promise<{ sent: number }> {
  try {
    const valid = Array.from(new Set(tokens)).filter((t) => Expo.isExpoPushToken(t));
    if (!valid.length) return { sent: 0 };
    const messages: ExpoPushMessage[] = valid.map((to) => ({
      to, sound: 'default', title: payload.title, body: payload.body, data: payload.data ?? {},
    }));
    const chunks = expo.chunkPushNotifications(messages);
    let sent = 0;
    for (const chunk of chunks) {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'ok') sent++;
        else if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          const bad = (chunk[i]?.to as string) ?? '';
          if (bad) void prisma.pushToken.deleteMany({ where: { token: bad } });
        }
      });
    }
    return { sent };
  } catch (e) {
    console.error('[push] sendBulkPush failed', e);
    return { sent: 0 };
  }
}
