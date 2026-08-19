import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, tokens } from './api';

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
  };

  const loginWithGoogle = async (idToken: string) => {
    const res = await api<{ accessToken: string; refreshToken: string }>('/auth/google', {
      method: 'POST',
      body: { idToken },
      auth: false,
    });
    await tokens.set(res.accessToken, res.refreshToken);
    setUser(await api<AuthUser>('/auth/me'));
  };

  const register = async (input: RegisterInput) => {
    const res = await api<{ accessToken: string; refreshToken: string }>('/auth/register', {
      method: 'POST',
      body: input,
      auth: false,
    });
    await tokens.set(res.accessToken, res.refreshToken);
    setUser(await api<AuthUser>('/auth/me'));
  };

  const logout = async () => {
    await tokens.clear();
    setUser(null);
  };

  const refreshUser = async () => {
    if (tokens.access) setUser(await api<AuthUser>('/auth/me'));
  };

  return (
    <Ctx.Provider value={{ user, loading, login, loginWithGoogle, register, logout, refreshUser }}>
      {children}
    </Ctx.Provider>
  );
}
