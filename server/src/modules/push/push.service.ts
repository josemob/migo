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
