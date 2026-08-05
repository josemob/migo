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

    await api('/me/push-token', { method: 'POST', body: { token, platform: Platform.OS } });
  } catch (e) {
    console.log('[push] registro omitido:', e instanceof Error ? e.message : e);
  }
}
