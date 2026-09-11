import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { syncBiometricToken } from './biometric';

// El teléfono no puede ver "localhost" de la PC. Derivamos la IP de la red
// local a partir del host de Metro (ej. "192.168.1.5:8081") y apuntamos al :8080.
function resolveBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_API_URL;
  if (override) return override;

  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0];
  if (host && host !== 'localhost') return `http://${host}:8080/api/v1`;
  return 'http://localhost:8080/api/v1';
}

export const BASE_URL = resolveBaseUrl();

const ACCESS_KEY = 'migo_access';
const REFRESH_KEY = 'migo_refresh';

let accessToken: string | null = null;
let refreshToken: string | null = null;

export const tokens = {
  get access() {
    return accessToken;
  },
  get refresh() {
    return refreshToken;
  },
  async load() {
    accessToken = await AsyncStorage.getItem(ACCESS_KEY);
    refreshToken = await AsyncStorage.getItem(REFRESH_KEY);
  },
  async set(a: string, r: string) {
    accessToken = a;
    refreshToken = r;
    await AsyncStorage.multiSet([
      [ACCESS_KEY, a],
      [REFRESH_KEY, r],
    ]);
    // Mantiene el token del login biométrico al día cuando el refresh rota.
    await syncBiometricToken(r).catch(() => {});
  },
  async clear() {
    accessToken = null;
    refreshToken = null;
    await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]).catch(() => {});
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// --- Sesión expirada -------------------------------------------------------
// Cuando el refresh token deja de servir, la UI tiene que volver al login aunque
// la petición original haya salido desde cualquier pantalla. AuthProvider se
// suscribe aquí y limpia el usuario.
type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

export function onUnauthorized(cb: Listener): () => void {
  unauthorizedListeners.add(cb);
  return () => {
    unauthorizedListeners.delete(cb);
  };
}

function emitUnauthorized() {
  for (const cb of unauthorizedListeners) {
    try {
      cb();
    } catch {
      /* noop */
    }
  }
}

// --- Refresh de token ------------------------------------------------------
// 'ok'      -> tokens renovados, reintentar la petición
// 'invalid' -> el refresh token ya no sirve: cerrar sesión
// 'error'   -> no se pudo contactar al servidor: NO cerrar sesión (red caída)
type RefreshResult = 'ok' | 'invalid' | 'error';

// Una sola renovación en vuelo: si varias peticiones reciben 401 al mismo tiempo
// comparten el mismo refresh. Sin esto, la segunda usaría un refresh token ya
// rotado (inválido) y cerraría la sesión sin motivo.
let refreshing: Promise<RefreshResult> | null = null;

function tryRefresh(): Promise<RefreshResult> {
  if (!refreshToken) return Promise.resolve('invalid');
  if (refreshing) return refreshing;

  refreshing = (async (): Promise<RefreshResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        signal: controller.signal,
      });
      if (res.status === 401 || res.status === 403) return 'invalid';
      if (!res.ok) return 'error';
      const data = (await res.json().catch(() => null)) as { accessToken?: string; refreshToken?: string } | null;
      if (!data?.accessToken || !data?.refreshToken) return 'error';
      await tokens.set(data.accessToken, data.refreshToken);
      return 'ok';
    } catch {
      return 'error';
    } finally {
      clearTimeout(timer);
      refreshing = null;
    }
  })();
  return refreshing;
}

interface Options {
  method?: string;
  body?: unknown;
  auth?: boolean;
  _retried?: boolean;
}

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  // Timeout: si el backend no responde, falla en vez de colgarse para siempre.
  // 60s para tolerar el "cold start" del plan free de Render (~30-60s al despertar).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted = err instanceof Error && err.name === 'AbortError';
    throw new ApiError(0, aborted ? 'El servidor está tardando (puede estar despertando). Reintenta en unos segundos.' : 'Error de red');
  }
  clearTimeout(timer);

  if (res.status === 401 && auth && !opts._retried) {
    const result = await tryRefresh();
    if (result === 'ok') return api<T>(path, { ...opts, _retried: true });
    if (result === 'invalid') {
      await tokens.clear();
      emitUnauthorized();
    }
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error?.message ?? 'Error de red');
  return data as T;
}
