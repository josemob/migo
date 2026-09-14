import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Icon, type IconName } from './Icon';
import { MigoLogo } from './MigoLogo';

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'General & Métricas', icon: 'dashboard', end: true },
  { to: '/comercios', label: 'Gestión de Comercios', icon: 'store' },
  { to: '/veterinarios', label: 'Verificación de Veterinarios', icon: 'hospital' },
  { to: '/especialidades', label: 'Solicitudes de Especialidad', icon: 'shield' },
  { to: '/emergencias', label: 'Monitor de Emergencias', icon: 'emergency' },
  { to: '/usuarios', label: 'Usuarios & Mascotas', icon: 'team' },
  { to: '/finanzas', label: 'Finanzas & Liquidaciones', icon: 'finance' },
  { to: '/planes', label: 'Planes & Suscripciones', icon: 'catalog' },
  { to: '/migo-ai', label: 'Migo AI & Contenido', icon: 'robot' },
  { to: '/marketing', label: 'Marketing & Difusión', icon: 'send' },
  { to: '/configuracion', label: 'Configuración Global', icon: 'settings' },
];

const STORAGE_KEY = 'migo_admin_sidebar_collapsed';

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });
  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  return (
    // Marco exterior gris + paneles flotantes redondeados (sidebar morado, lienzo cálido).
    <div className="flex h-screen gap-3 bg-warm-shell p-3">
      <aside
        // Colapsado = riel de iconos de 64px (antes 80px se veía ancho de más).
        className={`flex ${collapsed ? 'w-16' : 'w-72'} shrink-0 flex-col rounded-shell bg-brand-900 text-white shadow-soft transition-[width] duration-200 ease-in-out`}
      >
        {/* Logo + toggle */}
        <div className={`flex items-center py-5 ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
          <div className="flex items-center gap-3">
            {/* Monocromático blanco (letras caladas). Colapsado: solo el isotipo "M". */}
            <MigoLogo variant={collapsed ? 'isotype' : 'mono'} height={collapsed ? 24 : 26} />
            {!collapsed && (
              <span className="inline-block rounded-pill bg-green-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-300">
                Operativo
              </span>
            )}
          </div>
          {!collapsed && (
            <button onClick={toggle} title="Colapsar menú" className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white">
              <Icon name="chevronLeft" className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Botón expandir (visible solo colapsado) */}
        {collapsed && (
          <button onClick={toggle} title="Expandir menú" className="mx-auto mb-2 rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white">
            <Icon name="chevronRight" className="h-5 w-5" />
          </button>
        )}

        {!collapsed && <div className="px-6 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">Menú principal</div>}

        <nav className={`flex-1 space-y-1 overflow-y-auto ${collapsed ? 'px-2' : 'px-3'}`}>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              title={collapsed ? n.label : undefined}
              className={({ isActive }) =>
                // Activo en amarillo Migo sobre el morado: máximo contraste y el acento de la marca.
                `flex items-center rounded-pill py-2.5 text-sm font-medium transition ${collapsed ? 'justify-center px-0' : 'gap-3 px-3.5'} ${
                  isActive
                    ? 'bg-accent-300 font-semibold text-brand-900 shadow-lg shadow-accent-300/20'
                    : 'text-white/70 hover:bg-white/10'
                }`
              }
            >
              <Icon name={n.icon} className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{n.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Footer usuario */}
        <div className={`flex border-t border-white/10 py-4 ${collapsed ? 'flex-col items-center gap-3 px-2' : 'items-center gap-3 px-4'}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold">
            {user?.fullName?.[0]?.toUpperCase() ?? 'A'}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{user?.fullName ?? 'Admin'}</div>
              <div className="text-xs text-white/50">Super Admin</div>
            </div>
          )}
          <button
            onClick={logout}
            title="Cerrar sesión"
            className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <Icon name="logout" className="h-5 w-5" />
          </button>
        </div>
      </aside>

      {/* Lienzo cálido: lila muy claro -> crema -> amarillo pálido (identidad Migo) */}
      <main className="flex-1 overflow-y-auto rounded-shell bg-gradient-to-br from-warm-50 via-warm-100 to-warm-200 p-8">
        {/* Tope de ancho + centrado: en pantallas anchas (retina Mac, >1280px) el
            contenido no se estira infinitamente; queda centrado en monitores grandes. */}
        <div className="mx-auto w-full max-w-[1600px]">{children}</div>
      </main>
    </div>
  );
}
