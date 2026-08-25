import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Acceso por biometría (huella / rostro). Modelo: guardamos el refresh token en
// SecureStore (cifrado, respaldado por hardware) para poder RESTAURAR la sesión con
// la huella desde la pantalla de login. Como el refresh token rota en el backend,
// lo re-sincronizamos en cada rotación (ver tokens.set en api.ts).

const FLAG = 'migo_biometric'; // AsyncStorage: '1' si el usuario activó la biometría
const ASKED = 'migo_bio_asked'; // ya le preguntamos si quiere activarla (para no insistir)
const TOKEN_KEY = 'migo_bio_refresh'; // SecureStore: refresh token para el login biométrico

/** El dispositivo tiene hardware biométrico Y el usuario tiene huella/rostro registrados. */
export async function biometricSupported(): Promise<boolean> {
  try {
    const [hasHw, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHw && enrolled;
  } catch {
    return false;
  }
}

/** Etiqueta legible del método disponible ("huella" / "rostro" / "biometría"). */
export async function biometricLabel(): Promise<string> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    // La huella es lo más común en Android y coincide con el ícono del botón; si el
    // equipo soporta ambas, preferimos "huella".
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'huella';
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'rostro';
  } catch {
    /* noop */
  }
  return 'biometría';
}

export async function isBiometricEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(FLAG)) === '1';
}

export async function biometricAlreadyAsked(): Promise<boolean> {
  return (await AsyncStorage.getItem(ASKED)) === '1';
}

export async function markBiometricAsked(): Promise<void> {
  await AsyncStorage.setItem(ASKED, '1');
}

/** Pide la huella/rostro al usuario. Devuelve true si autenticó. */
export async function promptBiometric(reason = 'Confirma tu identidad'): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Cancelar',
      disableDeviceFallback: false, // permite el PIN del dispositivo como respaldo
    });
    return res.success;
  } catch {
    return false;
  }
}

/** Activa la biometría: exige autenticar una vez y guarda el refresh token actual. */
export async function enableBiometric(currentRefresh: string | null): Promise<boolean> {
  if (!(await biometricSupported())) return false;
  if (!(await promptBiometric('Activa el acceso con biometría'))) return false;
  await AsyncStorage.setItem(FLAG, '1');
  if (currentRefresh) await SecureStore.setItemAsync(TOKEN_KEY, currentRefresh);
  return true;
}

/** Desactiva la biometría y olvida el token guardado. */
export async function disableBiometric(): Promise<void> {
  await AsyncStorage.removeItem(FLAG);
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
}

/** Mantiene el token guardado al día cuando la sesión rota su refresh token. */
export async function syncBiometricToken(refresh: string | null): Promise<void> {
  if ((await AsyncStorage.getItem(FLAG)) !== '1') return;
  if (refresh) await SecureStore.setItemAsync(TOKEN_KEY, refresh).catch(() => {});
}

/** ¿Hay una sesión biométrica disponible para mostrar el botón de huella en el login? */
export async function hasBiometricSession(): Promise<boolean> {
  if ((await AsyncStorage.getItem(FLAG)) !== '1') return false;
  if (!(await biometricSupported())) return false;
  const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  return !!token;
}

export async function getBiometricToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
}
