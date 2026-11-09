import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { api } from './api';

// Muestra la notificación aunque la app esté en primer plano.
// Protegido: si el build no tuviera el módulo nativo, no debe tumbar la app.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch (e) {
  console.log('[push] setNotificationHandler no disponible:', e instanceof Error ? e.message : e);
}

// Qué app es esta: el backend solo le manda a cada teléfono los avisos de su app
// (p. ej. las emergencias van a Migo Vet, nunca a Migo cliente aunque sea la misma cuenta).
export const PUSH_APP = 'client' as const;

// Último token registrado, para darlo de baja al cerrar sesión.
let registeredToken: string | null = null;

function getProjectId(): string | undefined {
  const extra = (Constants.expoConfig?.extra ?? {}) as { eas?: { projectId?: string } };
  return extra.eas?.projectId ?? (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
}

/**
 * Pide permiso, obtiene el Expo push token y lo registra en el backend.
 * Silencioso: en emuladores sin Google Play Services / sin FCM configurado,
 * getExpoPushTokenAsync lanza y simplemente no se registra token.
 */
export async function registerForPush(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'General',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#8A2FA0',
      });
    }

    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    const projectId = getProjectId();
    const tokenResp = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const token = tokenResp.data;
    if (!token) return;

    await api('/me/push-token', { method: 'POST', body: { token, platform: Platform.OS, app: PUSH_APP } });
    registeredToken = token;
  } catch (e) {
    console.log('[push] registro omitido:', e instanceof Error ? e.message : e);
  }
}

/**
 * Da de baja el token de este teléfono (al cerrar sesión). Antes no se hacía y el teléfono
 * seguía recibiendo los avisos de la cuenta anterior. Silencioso: si falla, no bloquea el logout.
 */
export async function unregisterPush(): Promise<void> {
  try {
    let token = registeredToken;
    if (!token) {
      const projectId = getProjectId();
      token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    }
    if (token) await api('/me/push-token', { method: 'DELETE', body: { token } });
  } catch (e) {
    console.log('[push] baja omitida:', e instanceof Error ? e.message : e);
  }
  registeredToken = null;
}
