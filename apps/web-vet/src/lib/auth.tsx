import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, tokens } from './api';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  avatarUrl?: string | null;
  staffProfile?: {
    position: string;
    roleLabel?: string | null;
    clinic?: { name: string; organization?: { name: string } };
  } | null;
}

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = async () => {
    try {
      if (!tokens.access) return setUser(null);
      setUser(await api<AuthUser>('/auth/me'));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMe();
    const onLogout = () => setUser(null);
    window.addEventListener('migo:logout', onLogout);
    return () => window.removeEventListener('migo:logout', onLogout);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api<{ accessToken: string; refreshToken: string; user: AuthUser }>(
      '/auth/login',
      { method: 'POST', body: { email, password }, auth: false },
    );
    tokens.set(res.accessToken, res.refreshToken);
    setUser(await api<AuthUser>('/auth/me'));
  };

  const logout = () => {
    const refresh = tokens.refresh;
    if (refresh) void api('/auth/logout', { method: 'POST', body: { refreshToken: refresh }, auth: false }).catch(() => {});
    tokens.clear();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}
