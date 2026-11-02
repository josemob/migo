import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LatLng {
  lat: number;
  lng: number;
}

// El diálogo de Google "Precisión de la ubicación" se muestra una sola vez: antes salía
// cada vez que se entraba al Directorio aunque el usuario respondiera "No, gracias".
const ACCURACY_ASKED_KEY = 'migo_loc_accuracy_asked';

/**
 * Pide permiso de ubicación y obtiene la posición actual con un tiempo límite.
 * En Android sin un "fix" reciente, `getCurrentPositionAsync` puede tardar minutos
 * y dejaba pantallas (Alerta, Directorio) esperando para siempre. Si se agota el
 * tiempo, usa la última posición conocida. Nunca lanza: devuelve null si no hay
 * permiso o no se pudo obtener.
 */
export async function getPositionSafe(timeoutMs = 12000): Promise<LatLng | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const asked = (await AsyncStorage.getItem(ACCURACY_ASKED_KEY).catch(() => null)) === '1';
    if (!asked) void AsyncStorage.setItem(ACCURACY_ASKED_KEY, '1').catch(() => {});

    const pos = await Promise.race([
      // Sin el diálogo, si los ajustes no alcanzan, falla y caemos a la última posición conocida.
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: !asked }).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (pos) return { lat: pos.coords.latitude, lng: pos.coords.longitude };

    const last = await Location.getLastKnownPositionAsync().catch(() => null);
    return last ? { lat: last.coords.latitude, lng: last.coords.longitude } : null;
  } catch {
    return null;
  }
}
