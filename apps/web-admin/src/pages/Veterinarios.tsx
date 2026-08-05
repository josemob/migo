import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Card, ErrorNote, PageHeader, SectionTitle, Spinner } from '../components/ui';
import { Icon } from '../components/Icon';

interface Vet {
  id: string;
  fullName: string;
  email: string;
  avatarUrl?: string | null;
  clinic: string;
  specialty: string;
  collegiateNumber: string;
  verificationStatus: string;
  verifiedAt?: string | null;
}
interface VetsResp { pending: Vet[]; verified: Vet[] }

export default function Veterinarios() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-vets'], queryFn: () => api<VetsResp>('/admin/vets') });

  const mutation = useMutation({
    mutationFn: (v: { id: string; action: string }) => api(`/admin/vets/${v.id}/verify`, { method: 'POST', body: { action: v.action } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-vets'] }); setSelectedId(null); },
  });

  const selected = data?.pending.find((v) => v.id === selectedId) ?? data?.pending[0] ?? null;

  return (
    <div>
      <PageHeader
        title="Verificación de Veterinarios"
        subtitle="Valide las licencias médicas y otorgue la insignia de profesional verificado."
        actions={data ? <span className="rounded-full bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700">Médicos en revisión: {data.pending.length}</span> : null}
      />

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : error ? (
        <ErrorNote error={error} />
      ) : data ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            {!selected ? (
              <div className="py-16 text-center text-slate-400">✅ No hay veterinarios pendientes de verificación.</div>
            ) : (
              <div>
                <div className="flex items-center gap-4 border-b border-slate-100 pb-5">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-100 text-2xl font-bold text-migo-purple">
                    {selected.fullName[0]}
                  </div>
                  <div>
                    <div className="text-xl font-bold text-slate-900">{selected.fullName}</div>
                    <div className="text-sm text-slate-500">{selected.specialty} · {selected.clinic}</div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-4">
                  <DocBox label="Cédula Profesional (Validación ID)" />
                  <DocBox label="Carnet CMV (Colegio Médico Vet)" />
                </div>

                <div className="mt-5">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Número de Colegiado (CMV)</div>
                  <div className="flex gap-3">
                    <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700">{selected.collegiateNumber}</div>
                    <button className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">Validar en Registro CMV</button>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ id: selected.id, action: 'approve' })}
                    className="flex items-center justify-center gap-2 rounded-xl bg-green-500 py-3 font-semibold text-white hover:bg-green-600 disabled:opacity-60"
                  >
                    <Icon name="check" className="h-5 w-5" />Otorgar Insignia Médico Verificado
                  </button>
                  <button
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ id: selected.id, action: 'reject' })}
                    className="flex items-center justify-center gap-2 rounded-xl bg-red-500 py-3 font-semibold text-white hover:bg-red-600 disabled:opacity-60"
                  >
                    <Icon name="close" className="h-5 w-5" />Rechazar Verificación
                  </button>
                </div>
                {data.pending.length > 1 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {data.pending.map((v) => (
                      <button key={v.id} onClick={() => setSelectedId(v.id)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${selected.id === v.id ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>{v.fullName}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle>Recientemente Verificados</SectionTitle>
            <div className="space-y-3">
              {data.verified.length === 0 && <p className="text-sm text-slate-400">Aún no hay verificados.</p>}
              {data.verified.map((v) => (
                <div key={v.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-800">{v.fullName}</div>
                    <div className="text-xs text-slate-400">{v.collegiateNumber} · {v.clinic}</div>
                  </div>
                  <Badge tone="green">✓</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function DocBox({ label }: { label: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-300"><Icon name="image" className="h-9 w-9" /></div>
    </div>
  );
}
