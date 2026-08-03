import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, tokens } from './api';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  phone?: string | null;
}

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
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

  return (
    <Ctx.Provider value={{ user, loading, login, register, logout }}>{children}</Ctx.Provider>
  );
}
