import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { time } from '../lib/format';
import { Card, PageHeader, SectionTitle, Spinner, Badge, ErrorNote } from '../components/ui';
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

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Summary>('/dashboard/summary'),
    refetchInterval: 30000,
  });

  if (isLoading) return <Spinner className="mx-auto mt-20" />;
  if (error) return <ErrorNote error={error} />;
  if (!data) return null;

  const s = data.stats;

  return (
    <div>
      <PageHeader title="Panel de Control" subtitle="Resumen operativo de la sucursal." />

      {data.activeAlert && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-card border-2 border-red-200 bg-red-50 px-6 py-4">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500 text-white">
              <Icon name="emergency" className="h-6 w-6" />
            </div>
            <div>
              <div className="font-bold text-red-700">
                Alerta de emergencia en curso
                {data.activeAlert.distanceKm != null && ` — a ${data.activeAlert.distanceKm} km`}
              </div>
              <div className="text-sm text-red-800">
                Paciente: <b>{data.activeAlert.emergency.pet.name}</b> ({data.activeAlert.emergency.pet.breed}) ·
                Dueño: {data.activeAlert.emergency.owner.fullName}
              </div>
              {data.activeAlert.emergency.aiSummary && (
                <div className="mt-1 text-sm font-medium text-red-700">
                  Reporte IA Migo: {data.activeAlert.emergency.aiSummary}
                </div>
              )}
            </div>
          </div>
          <Link to="/urgencias" className="btn bg-red-500 text-white hover:bg-red-600">
            <Icon name="ambulance" className="h-5 w-5" /> Atender urgencia
          </Link>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatBox label="Citas Hoy" value={`${s.appointmentsToday} activas`} icon="calendar" />
        <StatBox label="Registrados" value={`+${s.newPetsThisWeek} esta semana`} icon="paw" />
        <StatBox label="Triajes Migo" value={`${s.triageAttendedThisMonth} atendidas`} icon="hospital" />
        <StatBox label="Staff Activo" value={`${s.staff.active} de ${s.staff.capacity} médicos`} icon="team" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <SectionTitle>Cronograma de Consultas</SectionTitle>
            <Link to="/agenda" className="text-sm font-semibold text-migo-purple">
              Ver agenda completa →
            </Link>
          </div>
          {data.schedule.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No hay citas para hoy.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.schedule.map((a) => (
                <li key={a.id} className="flex items-center gap-4 py-3">
                  <span className="w-20 shrink-0 text-sm font-semibold text-migo-purple">
                    {time(a.scheduledAt)}
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-800">
                      {a.service?.name ?? a.reason ?? 'Consulta'}
                    </div>
                    <div className="text-xs text-slate-500">
                      Mascota: {a.pet.name} ({a.pet.breed}) · {a.pet.owner.fullName}
                    </div>
                  </div>
                  <Badge tone={statusTone[a.status] ?? 'slate'}>{a.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle>Últimos Historiales</SectionTitle>
          {data.recentRecords.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Sin historiales recientes.</p>
          ) : (
            <ul className="space-y-3">
              {data.recentRecords.map((r) => (
                <li key={r.id} className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-600">
                    <Icon name="paw" className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-800">
                      {r.pet.name} <span className="font-normal text-slate-400">({r.pet.breed})</span>
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

function StatBox({ label, value, icon }: { label: string; value: string; icon: IconName }) {
  return (
    <div className="card flex flex-col gap-2 p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
          <Icon name={icon} className="h-5 w-5" />
        </span>
      </div>
      <div className="font-heading text-xl font-extrabold text-slate-900">{value}</div>
    </div>
  );
}
