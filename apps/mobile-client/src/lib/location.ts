import * as Location from 'expo-location';

export interface LatLng {
  lat: number;
  lng: number;
}

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

    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (pos) return { lat: pos.coords.latitude, lng: pos.coords.longitude };

    const last = await Location.getLastKnownPositionAsync().catch(() => null);
    return last ? { lat: last.coords.latitude, lng: last.coords.longitude } : null;
  } catch {
    return null;
  }
}
