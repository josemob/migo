import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth, isClinicAdmin } from '../lib/auth';
import { useEmergencyStream } from '../lib/useEmergencyStream';
import { playAlarm } from '../lib/alarm';
import { Icon, type IconName } from './Icon';
import { MigoLogo } from './MigoLogo';

const NAV: {
  section: string;
  adminOnly?: boolean;
  items: { to: string; label: string; icon: IconName; end?: boolean }[];
}[] = [
  {
    section: 'Operaciones Diarias',
    items: [
      { to: '/', label: 'Resumen', icon: 'dashboard', end: true },
      { to: '/agenda', label: 'Agenda & Citas', icon: 'calendar' },
      { to: '/urgencias', label: 'Urgencias & Guardia', icon: 'emergency' },
      { to: '/pacientes', label: 'Pacientes & Historiales', icon: 'paw' },
      { to: '/chats', label: 'Mensajes', icon: 'chat' },
    ],
  },
  {
    section: 'Administración y Soporte',
    adminOnly: true,
    items: [
      { to: '/equipo', label: 'Equipo Médico', icon: 'team' },
      { to: '/servicios', label: 'Catálogo de Servicios', icon: 'catalog' },
      { to: '/finanzas', label: 'Finanzas & Facturación', icon: 'finance' },
      { to: '/configuracion', label: 'Configuración', icon: 'settings' },
    ],
  },
];

const STORAGE_KEY = 'migo_vet_sidebar_collapsed';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const admin = isClinicAdmin(user);
  const nav = NAV.filter((g) => !g.adminOnly || admin);
  // Escucha urgencias en tiempo real (SSE) y suena la alarma al llegar una
  useEmergencyStream(playAlarm);
  const clinicName = user?.staffProfile?.clinic?.name ?? 'Sucursal';
  const orgName = user?.staffProfile?.clinic?.organization?.name ?? 'Migo Clínicas';

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
    // Marco exterior gris + paneles flotantes redondeados (igual que el Super Admin).
    <div className="flex h-screen gap-3 overflow-hidden bg-warm-shell p-3">
      {/* Sidebar */}
      <aside
        // Colapsado = riel de iconos de 64px
        className={`flex ${collapsed ? 'w-16' : 'w-72'} shrink-0 flex-col rounded-shell bg-brand-900 text-white shadow-soft transition-[width] duration-200 ease-in-out`}
      >
        {/* Logo + toggle */}
        <div className={`flex items-center py-6 ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
          <div className={collapsed ? '' : 'min-w-0 flex-1'}>
            {/* Monocromático (letras caladas); colapsado solo el isotipo "M" */}
            <MigoLogo variant={collapsed ? 'isotype' : 'mono'} height={collapsed ? 24 : 24} />
            {!collapsed && (
              <div className="mt-2.5 min-w-0">
                <div className="truncate text-sm font-bold leading-tight">{orgName}</div>
                <div className="truncate text-xs text-white/50">Sucursal: {clinicName}</div>
              </div>
            )}
          </div>
          {!collapsed && (
            <button onClick={toggle} title="Colapsar menú" className="shrink-0 self-start rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white">
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

        <nav className={`flex-1 overflow-y-auto py-2 ${collapsed ? 'px-2' : 'px-3'}`}>
          {nav.map((group) => (
            <div key={group.section} className={collapsed ? 'mb-3' : 'mb-6'}>
              {!collapsed && (
                <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                  {group.section}
                </div>
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    // Activo en amarillo Migo sobre el morado (acento de la marca)
                    `mb-1 flex items-center rounded-pill py-2.5 text-sm font-medium transition ${collapsed ? 'justify-center px-0' : 'gap-3 px-3.5'} ${
                      isActive
                        ? 'bg-accent-300 font-semibold text-brand-900 shadow-lg shadow-accent-300/20'
                        : 'text-white/70 hover:bg-white/10'
                    }`
                  }
                >
                  <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                  {!collapsed && item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className={`border-t border-white/10 py-4 ${collapsed ? 'px-2' : 'px-4'}`}>
          <div className={`flex ${collapsed ? 'flex-col items-center gap-3' : 'items-center gap-3'}`}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold">
              {user?.fullName?.[0] ?? 'U'}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{user?.fullName}</div>
                <div className="truncate text-xs text-white/50">
                  {user?.staffProfile?.roleLabel ?? user?.role}
                </div>
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
        </div>
      </aside>

      {/* Content — lienzo cálido (lila -> crema -> amarillo pálido) */}
      <main className="flex-1 overflow-y-auto rounded-shell bg-gradient-to-br from-warm-50 via-warm-100 to-warm-200 p-8">
        {/* Tope de ancho + centrado para pantallas anchas (retina Mac, >1280px): el
            contenido no se estira de borde a borde en monitores grandes. */}
        <div className="mx-auto w-full max-w-[1600px]">{children}</div>
      </main>
    </div>
  );
}
