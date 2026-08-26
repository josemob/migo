import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Pide permisos de cámara + micrófono en tiempo de ejecución antes de una videollamada.
 * Sin estos concedidos, la llamada se queda en "preparing" (no adquiere cámara/mic).
 */
export async function requestCallPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const res = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]);
    return (
      res['android.permission.CAMERA'] === PermissionsAndroid.RESULTS.GRANTED &&
      res['android.permission.RECORD_AUDIO'] === PermissionsAndroid.RESULTS.GRANTED
    );
  } catch {
    return false;
  }
}
