import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { time } from '../lib/format';
import { Card, PageHeader, SectionTitle, Spinner, Badge, ErrorNote } from '../components/ui';
import { Icon } from '../components/Icon';

interface Appt {
  id: string;
  scheduledAt: string;
  status: string;
  reason?: string;
  priceUsd?: string;
  pet: { name: string; breed?: string; weightKg?: string; photoUrl?: string; owner: { fullName: string } };
  service?: { name: string; category: string };
  vet?: { user: { fullName: string } };
}

const categoryColor: Record<string, string> = {
  CONSULTATION: 'bg-green-100 text-green-800 border-green-200',
  GROOMING: 'bg-blue-100 text-blue-800 border-blue-200',
  VACCINATION: 'bg-violet-100 text-violet-800 border-violet-200',
  EMERGENCY: 'bg-red-100 text-red-800 border-red-200',
};
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function Agenda() {
  const qc = useQueryClient();
  const [weekBase] = useState(() => startOfWeek(new Date()));
  const [selected, setSelected] = useState<string | null>(null);

  const from = weekBase;
  const to = useMemo(() => new Date(weekBase.getTime() + 7 * 86400000), [weekBase]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['appointments', from.toISOString()],
    queryFn: () =>
      api<{ data: Appt[] }>(`/appointments?from=${from.toISOString()}&to=${to.toISOString()}`),
  });

  const mutate = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/appointments/${id}/status`, { method: 'POST', body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });

  const days = Array.from({ length: 7 }, (_, i) => new Date(weekBase.getTime() + i * 86400000));
  const byDay = (d: Date) =>
    data?.data.filter((a) => new Date(a.scheduledAt).toDateString() === d.toDateString()) ?? [];

  const sel = data?.data.find((a) => a.id === selected);

  return (
    <div>
      <PageHeader title="Agenda & Citas" subtitle="Visualiza y gestiona las citas programadas para el equipo médico." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle>
            {from.toLocaleDateString('es-VE', { day: 'numeric', month: 'long' })} —{' '}
            {new Date(to.getTime() - 86400000).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })}
          </SectionTitle>

          {isLoading && <Spinner className="mx-auto my-8" />}
          {error && <ErrorNote error={error} />}

          <div className="grid grid-cols-7 gap-2">
            {days.map((d, i) => (
              <div key={i} className="min-h-[180px] rounded-xl border border-slate-100 p-2">
                <div className="mb-2 text-center text-xs font-semibold text-slate-500">
                  {DAYS[d.getDay()]?.slice(0, 3)} {d.getDate()}
                </div>
                <div className="space-y-1">
                  {byDay(d).map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setSelected(a.id)}
                      className={`w-full rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold leading-tight ${
                        categoryColor[a.service?.category ?? ''] ?? 'bg-slate-100 text-slate-700 border-slate-200'
                      } ${selected === a.id ? 'ring-2 ring-migo-purple' : ''}`}
                    >
                      {time(a.scheduledAt)}
                      <div className="truncate font-bold">{a.reason ?? a.pet.name}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle>Detalle de Cita Seleccionada</SectionTitle>
          {!sel ? (
            <p className="py-8 text-center text-sm text-slate-400">Selecciona una cita del calendario.</p>
          ) : (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-100 text-2xl">🐾</div>
                <div>
                  <div className="text-lg font-bold text-slate-900">{sel.pet.name}</div>
                  <div className="text-sm text-slate-500">
                    {sel.pet.breed} {sel.pet.weightKg && `· ${sel.pet.weightKg} kg`}
                  </div>
                </div>
              </div>
              <dl className="mb-4 space-y-1 text-sm">
                <Row label="Propietario" value={sel.pet.owner.fullName} />
                <Row label="Motivo" value={sel.reason ?? '—'} />
                <Row label="Veterinario" value={sel.vet?.user.fullName ?? 'Sin asignar'} />
                <Row label="Estado" value={<Badge tone="purple">{sel.status}</Badge>} />
              </dl>

              <div className="space-y-2">
                {sel.status === 'CONFIRMED' && (
                  <button
                    className="btn-primary w-full"
                    onClick={() => mutate.mutate({ id: sel.id, status: 'IN_PROGRESS' })}
                  >
                    <Icon name="bolt" className="h-4 w-4" /> Iniciar Atención (En Sala)
                  </button>
                )}
                {sel.status === 'PENDING' && (
                  <button
                    className="btn-primary w-full"
                    onClick={() => mutate.mutate({ id: sel.id, status: 'CONFIRMED' })}
                  >
                    Confirmar Turno
                  </button>
                )}
                {sel.status === 'IN_PROGRESS' && (
                  <button
                    className="btn-green w-full"
                    onClick={() => mutate.mutate({ id: sel.id, status: 'COMPLETED' })}
                  >
                    <Icon name="check" className="h-4 w-4" /> Completar Consulta
                  </button>
                )}
                <button className="btn-outline w-full">
                  <Icon name="calendar" className="h-4 w-4" /> Reprogramar Cita
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-400">{label}:</dt>
      <dd className="text-right font-medium text-slate-700">{value}</dd>
    </div>
  );
}
