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
  cancelReason?: string | null;
}

const STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'Por aceptar', tone: 'amber' },
  CONFIRMED: { label: 'Confirmada', tone: 'purple' },
  IN_PROGRESS: { label: 'En sala', tone: 'blue' },
  COMPLETED: { label: 'Completada', tone: 'green' },
  CANCELLED: { label: 'Cancelada', tone: 'red' },
  NO_SHOW: { label: 'No asistió', tone: 'slate' },
};

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

  // Rechazo de una solicitud: el motivo es obligatorio (lo recibe el dueño por notificación).
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const mutate = useMutation({
    mutationFn: ({ id, status, cancelReason }: { id: string; status: string; cancelReason?: string }) =>
      api(`/appointments/${id}/status`, { method: 'POST', body: { status, cancelReason } }),
    onSuccess: () => {
      setRejecting(false);
      setRejectReason('');
    },
    // También al fallar: p. ej. otro miembro del equipo ya la aceptó → se refresca el estado.
    onSettled: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
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
                      onClick={() => {
                        setSelected(a.id);
                        setRejecting(false);
                        mutate.reset();
                      }}
                      className={`w-full rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold leading-tight ${
                        categoryColor[a.service?.category ?? ''] ?? 'bg-slate-100 text-slate-700 border-slate-200'
                      } ${selected === a.id ? 'ring-2 ring-migo-purple' : ''}`}
                    >
                      {time(a.scheduledAt)}
                      {a.status === 'PENDING' && <span className="ml-1 rounded bg-amber-200 px-1 text-[10px] text-amber-800">Por aceptar</span>}
                      <div className={`truncate font-bold ${a.status === 'CANCELLED' ? 'line-through opacity-60' : ''}`}>{a.reason ?? a.pet.name}</div>
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
                <Row label="Estado" value={<Badge tone={STATUS[sel.status]?.tone ?? 'slate'}>{STATUS[sel.status]?.label ?? sel.status}</Badge>} />
                {sel.status === 'CANCELLED' && sel.cancelReason && <Row label="Motivo del rechazo" value={sel.cancelReason} />}
              </dl>

              {mutate.error && <div className="mb-3"><ErrorNote error={mutate.error} /></div>}

              <div className="space-y-2">
                {sel.status === 'CONFIRMED' && (
                  <button
                    className="btn-primary w-full"
                    onClick={() => mutate.mutate({ id: sel.id, status: 'IN_PROGRESS' })}
                  >
                    <Icon name="bolt" className="h-4 w-4" /> Iniciar Atención (En Sala)
                  </button>
                )}
                {sel.status === 'PENDING' && !rejecting && (
                  <>
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Solicitud del dueño. Al aceptarla queda asignada a ti y el dueño recibe la confirmación con el resumen.
                    </p>
                    <button
                      className="btn-primary w-full"
                      disabled={mutate.isPending}
                      onClick={() => mutate.mutate({ id: sel.id, status: 'CONFIRMED' })}
                    >
                      <Icon name="check" className="h-4 w-4" /> Aceptar Cita
                    </button>
                    <button
                      className="btn-outline w-full !border-red-300 !text-red-600"
                      disabled={mutate.isPending}
                      onClick={() => setRejecting(true)}
                    >
                      Rechazar
                    </button>
                  </>
                )}
                {sel.status === 'PENDING' && rejecting && (
                  <div className="space-y-2 rounded-xl border border-red-200 p-3">
                    <label className="block text-xs font-semibold text-slate-500">Motivo del rechazo (lo verá el dueño)</label>
                    <textarea
                      className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                      rows={3}
                      maxLength={200}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Ej.: Ese horario ya no está disponible"
                    />
                    <button
                      className="btn-primary w-full !bg-red-600"
                      disabled={mutate.isPending || rejectReason.trim().length < 3}
                      onClick={() => mutate.mutate({ id: sel.id, status: 'CANCELLED', cancelReason: rejectReason.trim() })}
                    >
                      Rechazar y avisar al dueño
                    </button>
                    <button className="btn-outline w-full" onClick={() => setRejecting(false)}>Volver</button>
                  </div>
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
