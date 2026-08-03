import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

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
  },
  async clear() {
    accessToken = null;
    refreshToken = null;
    await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  await tokens.set(data.accessToken, data.refreshToken);
  return true;
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

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && auth && !opts._retried) {
    if (await tryRefresh()) return api<T>(path, { ...opts, _retried: true });
    await tokens.clear();
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error?.message ?? 'Error de red');
  return data as T;
}
