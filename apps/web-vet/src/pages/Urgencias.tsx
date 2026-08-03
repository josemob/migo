import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, PageHeader, SectionTitle, Spinner, Badge, ErrorNote } from '../components/ui';
import { Icon } from '../components/Icon';

interface Alert {
  id: string;
  distanceKm?: number;
  etaMinutes?: number;
  status: string;
  emergency: {
    id: string;
    status: string;
    symptoms?: string;
    pet: {
      name: string;
      breed?: string;
      weightKg?: string;
      bloodType?: string;
      allergies: { substance: string; reaction?: string }[];
      conditions: { name: string }[];
      owner: { fullName: string; phone?: string; nationalId?: string };
    };
  };
}

export default function Urgencias() {
  const qc = useQueryClient();
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'err'; msg: string } | null>(null);
  const flash = (tone: 'ok' | 'err', msg: string) => {
    setFeedback({ tone, msg });
    setTimeout(() => setFeedback(null), 5000);
  };

  const active = useQuery({ queryKey: ['emg-active'], queryFn: () => api<{ data: Alert[] }>('/emergencies/active'), refetchInterval: 30000 });
  const recent = useQuery({ queryKey: ['emg-recent'], queryFn: () => api<{ data: { id: string; status: string; symptoms?: string; pet: { name: string; breed?: string } }[] }>('/emergencies/recent') });

  const accept = useMutation({
    mutationFn: (alertId: string) => api(`/emergencies/alerts/${alertId}/accept`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emg-active'] });
      flash('ok', 'Urgencia aceptada. Contacta al dueño y prepara la llegada.');
    },
    onError: (e) => flash('err', e instanceof Error ? e.message : 'No se pudo aceptar la urgencia'),
  });
  const attended = useMutation({
    mutationFn: (emgId: string) => api(`/emergencies/${emgId}/attended`, { method: 'POST', body: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emg-active'] });
      qc.invalidateQueries({ queryKey: ['emg-recent'] });
      flash('ok', '✅ Paciente marcado como atendido. Se registró el lead CPL ($5) en Finanzas.');
    },
    onError: (e) => flash('err', e instanceof Error ? e.message : 'No se pudo marcar como atendido'),
  });

  const alert = active.data?.data[0];

  return (
    <div>
      <PageHeader title="Urgencias & Guardia Médica" subtitle="Canalización inmediata de pacientes en estado crítico y monitoreo de ruta." />

      {feedback && (
        <div
          className={`mb-6 rounded-card border px-5 py-3 text-sm font-semibold ${
            feedback.tone === 'ok'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {active.isLoading && <Spinner className="mx-auto mt-10" />}
      {active.error && <ErrorNote error={active.error} />}

      {alert && (
        <div className="mb-6 flex items-center gap-2 rounded-card border border-amber-300 bg-amber-50 px-6 py-3 text-sm font-bold text-amber-800">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> ALERTA ACTIVA — Paciente en camino
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {!alert ? (
            <p className="py-10 text-center text-sm text-slate-400">No hay urgencias activas en este momento.</p>
          ) : (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-2xl font-extrabold text-red-600">{alert.emergency.pet.name.toUpperCase()}</h3>
                  <Badge tone="slate">{alert.emergency.pet.breed}</Badge>
                </div>
                {alert.distanceKm != null && (
                  <span className="badge inline-flex items-center gap-1 bg-red-100 text-red-700">
                    <Icon name="pin" className="h-3.5 w-3.5" /> {alert.distanceKm} km{' '}
                    {alert.etaMinutes && `~${alert.etaMinutes} min de llegada`}
                  </span>
                )}
              </div>

              <div className="mb-4 grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4">
                <Field label="Peso Registrado" value={alert.emergency.pet.weightKg ? `${alert.emergency.pet.weightKg} Kg` : '—'} />
                <Field label="Grupo Sanguíneo" value={alert.emergency.pet.bloodType ?? '—'} />
              </div>

              {alert.emergency.symptoms && (
                <div className="mb-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Síntomas Reportados</div>
                  <p className="font-semibold text-red-700">{alert.emergency.symptoms}</p>
                </div>
              )}

              <div className="mb-4 space-y-1 text-sm">
                {alert.emergency.pet.allergies.map((a, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Icon name="emergency" className="h-4 w-4 text-amber-500" />
                    <span className="font-semibold text-amber-700">ALERGIAS:</span>
                    <span className="badge border border-red-200 bg-red-50 text-red-600">
                      {a.substance}{a.reaction && ` (${a.reaction})`}
                    </span>
                  </div>
                ))}
                {alert.emergency.pet.conditions.map((c, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Icon name="emergency" className="h-4 w-4 text-amber-500" />
                    <span className="font-semibold text-amber-700">PREEXISTENCIAS:</span>
                    <span className="badge border border-amber-200 bg-amber-50 text-amber-700">{c.name}</span>
                  </div>
                ))}
              </div>

              <div className="mb-4 flex items-center gap-3 border-t border-slate-100 pt-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 font-bold">
                  {alert.emergency.pet.owner.fullName[0]}
                </div>
                <div className="text-sm">
                  <div className="font-semibold text-slate-800">Propietario: {alert.emergency.pet.owner.fullName}</div>
                  <div className="text-slate-500">
                    {alert.emergency.pet.owner.phone} · ID: {alert.emergency.pet.owner.nationalId}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                {alert.status !== 'ACCEPTED' ? (
                  <button className="btn-primary flex-1" onClick={() => accept.mutate(alert.id)} disabled={accept.isPending}>
                    <Icon name="check" className="h-4 w-4" /> Aceptar Urgencia
                  </button>
                ) : (
                  <button
                    className="btn-green flex-1"
                    onClick={() => {
                      if (confirm('¿Marcar como atendido? Esto cierra la urgencia y registra el lead CPL ($5).')) {
                        attended.mutate(alert.emergency.id);
                      }
                    }}
                    disabled={attended.isPending}
                  >
                    <Icon name="hospital" className="h-4 w-4" />{' '}
                    {attended.isPending ? 'Marcando…' : 'Marcar Paciente Atendido'}
                  </button>
                )}
                <button className="btn border border-red-300 text-red-600 hover:bg-red-50">
                  <Icon name="phone" className="h-4 w-4" /> Llamar al Dueño
                </button>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle>Alertas de Guardia Recientes</SectionTitle>
          {recent.data?.data.length === 0 && <p className="text-sm text-slate-400">Sin alertas recientes.</p>}
          <div className="space-y-3">
            {recent.data?.data.map((e) => (
              <div key={e.id} className="rounded-xl border border-slate-100 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">
                    {e.pet.name} <span className="font-normal text-slate-400">({e.pet.breed})</span>
                  </span>
                  <Badge tone={e.status === 'HOSPITALIZED' ? 'purple' : 'green'}>
                    {e.status === 'HOSPITALIZED' ? 'Hospitalizado' : 'Atendido'}
                  </Badge>
                </div>
                {e.symptoms && <div className="mt-1 text-xs text-slate-500">{e.symptoms}</div>}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="font-bold text-slate-800">{value}</div>
    </div>
  );
}
