import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { time } from '../lib/format';
import { useAuth } from '../lib/auth';
import { Badge, Card, DarkCard, ErrorNote, RingProgress, Spinner, StatBig } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';

interface Summary {
  stats: {
    appointmentsToday: number;
    newPetsThisWeek: number;
    triageAttendedThisMonth: number;
    staff: { active: number; capacity: number };
  };
  activeAlert: {
    distanceKm?: number;
    emergency: {
      aiSummary?: string;
      pet: { name: string; breed?: string };
      owner: { fullName: string; phone?: string };
    };
  } | null;
  schedule: {
    id: string;
    scheduledAt: string;
    status: string;
    reason?: string;
    pet: { name: string; breed?: string; owner: { fullName: string } };
    service?: { name: string };
  }[];
  recentRecords: { id: string; visitedAt: string; reason?: string; pet: { name: string; breed?: string } }[];
}

const statusTone: Record<string, string> = {
  CONFIRMED: 'purple',
  PENDING: 'amber',
  IN_PROGRESS: 'blue',
  COMPLETED: 'green',
};

const hoy = () =>
  new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' });

export default function Dashboard() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Summary>('/dashboard/summary'),
    refetchInterval: 30000,
  });

  const firstName = user?.fullName?.replace(/^Dra?\.\s*/i, '').split(' ')[0] ?? '';

  if (isLoading) return <Spinner className="mx-auto mt-20" />;
  if (error) return <ErrorNote error={error} />;
  if (!data) return null;

  const s = data.stats;
  const schedule = data.schedule ?? [];
  const recent = data.recentRecords ?? [];
  const cap = s.staff.capacity > 0 ? (s.staff.active / s.staff.capacity) * 100 : 0;

  return (
    <div>
      {/* ── Cabecera: saludo + números grandes ───────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-heading text-[42px] font-extrabold leading-tight tracking-tight text-brand-900">
            Hola, {firstName || 'equipo'}
          </h1>
          <p className="mt-1 text-sm capitalize text-slate-500">{hoy()}</p>
        </div>
        <div className="flex items-start gap-9">
          <StatBig value={s.appointmentsToday} label="Citas hoy" icon={<Icon name="calendar" className="h-3.5 w-3.5" />} />
          <StatBig value={s.newPetsThisWeek} label="Nuevos pacientes" icon={<Icon name="paw" className="h-3.5 w-3.5" />} />
          <StatBig value={s.triageAttendedThisMonth} label="Triajes del mes" icon={<Icon name="hospital" className="h-3.5 w-3.5" />} />
        </div>
      </div>

      {/* ── Urgencia activa: lo más importante, arriba de todo ───────────── */}
      {data.activeAlert && (
        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-card border-2 border-red-200 bg-red-50 px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
              <Icon name="emergency" className="h-6 w-6" />
            </div>
            <div>
              <div className="font-heading font-bold text-red-700">
                Alerta de emergencia en curso
                {data.activeAlert.distanceKm != null && ` — a ${data.activeAlert.distanceKm} km`}
              </div>
              <div className="text-sm text-red-800">
                Paciente: <b>{data.activeAlert.emergency.pet?.name ?? '—'}</b>
                {data.activeAlert.emergency.pet?.breed ? ` (${data.activeAlert.emergency.pet.breed})` : ''} ·
                Dueño: {data.activeAlert.emergency.owner?.fullName ?? '—'}
              </div>
              {data.activeAlert.emergency.aiSummary && (
                <div className="mt-1 text-sm font-medium text-red-700">
                  Reporte IA Migo: {data.activeAlert.emergency.aiSummary}
                </div>
              )}
            </div>
          </div>
          <Link
            to="/urgencias"
            className="inline-flex items-center gap-2 rounded-pill bg-red-500 px-5 py-3 font-heading text-sm font-bold text-white transition hover:bg-red-600"
          >
            <Icon name="ambulance" className="h-5 w-5" /> Atender urgencia
          </Link>
        </div>
      )}

      {/* ── Bento grid ───────────────────────────────────────────────────── */}
      <div className="mt-6 grid grid-cols-12 gap-5">
        {/* Agenda del día (tarjeta ancha) */}
        <Card className="col-span-12 lg:col-span-8">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-heading text-lg font-bold text-brand-900">Cronograma de hoy</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                {schedule.length > 0 ? `${schedule.length} consulta${schedule.length === 1 ? '' : 's'} programada${schedule.length === 1 ? '' : 's'}` : 'Sin citas programadas'}
              </p>
            </div>
            <Link to="/agenda" className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-migo-purple transition hover:bg-brand-100">
              <Icon name="chevronRight" className="h-4 w-4" />
            </Link>
          </div>

          {schedule.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No hay citas para hoy.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {schedule.map((a) => (
                <li key={a.id} className="flex items-center gap-4 rounded-2xl bg-slate-50/80 px-4 py-3">
                  <span className="w-16 shrink-0 font-heading text-sm font-extrabold text-migo-purple">
                    {time(a.scheduledAt)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-800">
                      {a.service?.name ?? a.reason ?? 'Consulta'}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {a.pet?.name}{a.pet?.breed ? ` (${a.pet.breed})` : ''} · {a.pet?.owner?.fullName ?? '—'}
                    </div>
                  </div>
                  <Badge tone={statusTone[a.status] ?? 'slate'}>{a.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Equipo en turno (anillo) */}
        <Card className="col-span-12 flex flex-col items-center lg:col-span-4">
          <div className="flex w-full items-start justify-between">
            <h2 className="font-heading text-lg font-bold text-brand-900">Equipo en turno</h2>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-migo-purple">
              <Icon name="team" className="h-4 w-4" />
            </span>
          </div>
          <div className="my-2">
            <RingProgress
              percent={cap}
              label={`${s.staff.active}/${s.staff.capacity}`}
              sub="médicos activos"
            />
          </div>
          <p className="text-center text-xs text-slate-400">
            {s.staff.capacity > 0
              ? `${Math.round(cap)}% de la capacidad de la sucursal.`
              : 'Aún no hay capacidad configurada.'}
          </p>
        </Card>

        {/* Accesos rápidos (tarjeta de énfasis morada) */}
        <DarkCard className="col-span-12 lg:col-span-4">
          <h2 className="font-heading text-lg font-bold">Accesos rápidos</h2>
          <div className="mt-5 space-y-2.5">
            <QuickRow to="/urgencias" icon="emergency" label="Urgencias & guardia" />
            <QuickRow to="/agenda" icon="calendar" label="Agenda & citas" />
            <QuickRow to="/pacientes" icon="paw" label="Pacientes & historiales" />
            <QuickRow to="/chats" icon="chat" label="Mensajes con clientes" />
          </div>
        </DarkCard>

        {/* Últimos historiales */}
        <Card className="col-span-12 lg:col-span-8">
          <div className="flex items-start justify-between">
            <h2 className="font-heading text-lg font-bold text-brand-900">Últimos historiales</h2>
            <Link to="/pacientes" className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-migo-purple transition hover:bg-brand-100">
              <Icon name="chevronRight" className="h-4 w-4" />
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">Sin historiales recientes.</p>
          ) : (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-slate-50/80 px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-migo-purple">
                    <Icon name="paw" className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-800">
                      {r.pet?.name} <span className="font-normal text-slate-400">{r.pet?.breed ? `(${r.pet.breed})` : ''}</span>
                    </div>
                    <div className="truncate text-xs text-slate-500">{r.reason ?? 'Consulta'}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function QuickRow({ to, icon, label }: { to: string; icon: IconName; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-2xl bg-white/[0.07] px-4 py-3 transition hover:bg-white/[0.12]">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
        <Icon name={icon} className="h-4 w-4 text-accent-300" />
      </span>
      <span className="flex-1 text-sm font-medium text-white/85">{label}</span>
      <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-white/30" />
    </Link>
  );
}
