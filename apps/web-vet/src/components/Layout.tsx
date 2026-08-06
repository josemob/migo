import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth, isClinicAdmin } from '../lib/auth';
import { useEmergencyStream } from '../lib/useEmergencyStream';
import { playAlarm } from '../lib/alarm';
import { Icon, type IconName } from './Icon';

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

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const admin = isClinicAdmin(user);
  const nav = NAV.filter((g) => !g.adminOnly || admin);
  // Escucha urgencias en tiempo real (SSE) y suena la alarma al llegar una
  useEmergencyStream(playAlarm);
  const clinicName = user?.staffProfile?.clinic?.name ?? 'Sucursal';
  const orgName = user?.staffProfile?.clinic?.organization?.name ?? 'Migo Clínicas';

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-72 shrink-0 flex-col bg-sidebar text-white">
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-white">
            <Icon name="paw" className="h-6 w-6" />
          </div>
          <div>
            <div className="text-lg font-bold leading-tight">{orgName}</div>
            <div className="text-xs text-sidebar-muted">Sucursal: {clinicName}</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {nav.map((group) => (
            <div key={group.section} className="mb-6">
              <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
                {group.section}
              </div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? 'bg-sidebar-active text-white shadow-lg'
                        : 'text-slate-200 hover:bg-sidebar-hover'
                    }`
                  }
                >
                  <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-migo-purple text-sm font-bold">
              {user?.fullName?.[0] ?? 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{user?.fullName}</div>
              <div className="text-xs text-sidebar-muted">
                {user?.staffProfile?.roleLabel ?? user?.role}
              </div>
            </div>
            <button
              onClick={logout}
              title="Cerrar sesión"
              className="rounded-lg p-2 text-sidebar-muted hover:bg-sidebar-hover hover:text-white"
            >
              <Icon name="logout" className="h-5 w-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
