import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, tokens } from './api';
import { appAlert } from './dialog';
import {
  getBiometricToken,
  promptBiometric,
  disableBiometric,
  biometricSupported,
  isBiometricEnabled,
  biometricAlreadyAsked,
  markBiometricAsked,
  enableBiometric,
  biometricLabel,
} from './biometric';

// Tras un login normal, ofrece una vez activar el acceso biométrico (si el equipo lo
// soporta y aún no está activo). No bloquea el flujo.
async function offerBiometricEnrollment() {
  try {
    if ((await isBiometricEnabled()) || (await biometricAlreadyAsked())) return;
    if (!(await biometricSupported())) return;
    await markBiometricAsked();
    const label = await biometricLabel();
    appAlert('Acceso rápido', `¿Quieres iniciar sesión con tu ${label} la próxima vez?`, [
      { text: 'Ahora no', style: 'cancel' },
      { text: 'Activar', onPress: () => { void enableBiometric(tokens.refresh); } },
    ]);
  } catch {
    /* noop */
  }
}

export interface StaffProfile {
  id: string;
  clinicId: string;
  position: string;
  roleLabel?: string | null;
  specialty?: string | null;
  collegiateNumber?: string | null;
  cmvLicense?: string | null;
  verificationStatus?: string | null; // PENDING | UNDER_REVIEW | VERIFIED | REJECTED
  ratingAvg?: string | number | null; // Prisma Decimal -> string en JSON
  ratingCount?: number | null;
  experienceYears?: number | null; // opcional (backend por wirear)
  currentShift?: string | null; // turno de hoy (ShiftType), opcional
  clinic?: { name: string } | null;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  phone?: string | null;
  nationalId?: string | null;
  avatarUrl?: string | null;
  staffProfile?: StaffProfile | null;
}

// Roles que pueden usar la app de staff (veterinarios, peluqueros, admin de sucursal)
export const isStaff = (u: AuthUser | null) => !!u && (u.role === 'VET' || u.role === 'CLINIC_ADMIN');

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginWithBiometric: () => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  nationalId?: string;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await tokens.load();
      try {
        if (tokens.access) setUser(await api<AuthUser>('/auth/me'));
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api<{ accessToken: string; refreshToken: string }>('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
    await tokens.set(res.accessToken, res.refreshToken);
    setUser(await api<AuthUser>('/auth/me'));
    void offerBiometricEnrollment();
  };

  const loginWithGoogle = async (idToken: string) => {
    const res = await api<{ accessToken: string; refreshToken: string }>('/auth/google', {
      method: 'POST',
      body: { idToken },
      auth: false,
    });
    await tokens.set(res.accessToken, res.refreshToken);
    setUser(await api<AuthUser>('/auth/me'));
    void offerBiometricEnrollment();
  };

  const register = async (input: RegisterInput) => {
    const res = await api<{ accessToken: string; refreshToken: string }>('/auth/register', {
      method: 'POST',
      body: input,
      auth: false,
    });
    await tokens.set(res.accessToken, res.refreshToken);
    setUser(await api<AuthUser>('/auth/me'));
    void offerBiometricEnrollment();
  };

  // Restaura la sesión con huella/rostro: exige biometría y canjea el refresh token
  // guardado. Mantiene la biometría activa tras cerrar sesión (no revoca en logout).
  const loginWithBiometric = async () => {
    if (!(await promptBiometric('Inicia sesión con biometría'))) throw new Error('Autenticación cancelada');
    const saved = await getBiometricToken();
    if (!saved) throw new Error('No hay una sesión guardada. Inicia sesión una vez para activar la biometría.');
    let res: { accessToken: string; refreshToken: string };
    try {
      res = await api<{ accessToken: string; refreshToken: string }>('/auth/refresh', { method: 'POST', body: { refreshToken: saved }, auth: false });
    } catch {
      await disableBiometric();
      throw new Error('Tu sesión guardada expiró. Inicia sesión con tu contraseña.');
    }
    await tokens.set(res.accessToken, res.refreshToken);
    setUser(await api<AuthUser>('/auth/me'));
  };

  const logout = async () => {
    // No revocamos el refresh en el servidor para que el login biométrico siga sirviendo.
    await tokens.clear();
    setUser(null);
  };

  const refreshUser = async () => {
    if (tokens.access) setUser(await api<AuthUser>('/auth/me'));
  };

  return (
    <Ctx.Provider value={{ user, loading, login, loginWithGoogle, loginWithBiometric, register, logout, refreshUser }}>
      {children}
    </Ctx.Provider>
  );
}
