import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import { prisma } from '../../config/prisma';

const expo = new Expo();

/** Registra (o actualiza) un Expo push token para un usuario. */
export async function registerPushToken(userId: string, token: string, platform?: string) {
  if (!Expo.isExpoPushToken(token)) return;
  await prisma.pushToken.upsert({
    where: { token },
    create: { userId, token, platform },
    update: { userId, platform },
  });
}

export async function removePushToken(token: string) {
  await prisma.pushToken.deleteMany({ where: { token } });
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
export async function sendPush(userId: string, payload: PushPayload) {
  try {
    // Respeta la preferencia del usuario: si desactivó las push, no se le envían.
    const pref = await prisma.user.findUnique({ where: { id: userId }, select: { notifyPush: true } });
    if (pref && !pref.notifyPush) return;
    const tokens = await prisma.pushToken.findMany({ where: { userId }, select: { token: true } });
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
