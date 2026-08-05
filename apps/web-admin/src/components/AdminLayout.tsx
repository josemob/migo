import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const NAV = [
  { to: '/', label: 'General & Métricas', icon: '📊', end: true },
  { to: '/comercios', label: 'Gestión de Comercios', icon: '🏪' },
  { to: '/veterinarios', label: 'Verificación de Veterinarios', icon: '🩺' },
  { to: '/emergencias', label: 'Monitor de Emergencias', icon: '🚨' },
  { to: '/usuarios', label: 'Usuarios & Mascotas', icon: '👥' },
  { to: '/finanzas', label: 'Finanzas & Liquidaciones', icon: '💳' },
  { to: '/migo-ai', label: 'Migo AI & Contenido', icon: '🤖' },
  { to: '/configuracion', label: 'Configuración Global', icon: '⚙️' },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="flex h-screen">
      <aside className="flex w-72 shrink-0 flex-col bg-brand-900 text-white">
        <div className="flex items-center gap-3 px-6 py-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F26B3A] font-heading text-xl font-black text-white">M</div>
          <div>
            <div className="font-heading text-lg font-extrabold leading-none">MIGO</div>
            <span className="mt-1 inline-block rounded bg-green-400/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-300">
              Sistema Operativo
            </span>
          </div>
        </div>

        <div className="px-6 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">Menú principal</div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30' : 'text-white/70 hover:bg-white/5'
                }`
              }
            >
              <span className="text-base">{n.icon}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3 border-t border-white/10 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-sm font-bold">
            {user?.fullName?.[0]?.toUpperCase() ?? 'A'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{user?.fullName ?? 'Admin'}</div>
            <div className="text-xs text-white/50">Super Admin</div>
          </div>
          <button
            onClick={logout}
            title="Cerrar sesión"
            className="rounded-lg px-2 py-1.5 text-lg text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            ⎋
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-canvas p-8">{children}</main>
    </div>
  );
}
