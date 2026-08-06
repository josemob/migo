import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Card, ErrorNote, PageHeader, SectionTitle, Spinner } from '../components/ui';
import { Icon } from '../components/Icon';

interface Kyc {
  id: string;
  requestedPosition: string;
  roleLabel?: string | null;
  selfieUrl?: string | null;
  idDocumentUrl?: string | null;
  cmvCardUrl?: string | null;
  collegiateNumber?: string | null;
  specialty?: string | null;
  faceMatchScore?: number | null;
  faceMatchPassed?: boolean | null;
  status: 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  reviewNotes?: string | null;
  createdAt: string;
  user: { fullName: string; email: string; nationalId?: string | null; phone?: string | null };
}
interface KycResp {
  data: Kyc[];
  counts: { review: number; approved: number; rejected: number };
}

const POSITION: Record<string, string> = {
  VET: 'Veterinario/a',
  GROOMER: 'Peluquero / Estética',
  RECEPTIONIST: 'Recepción',
  SUPPORT: 'Personal de apoyo',
  BRANCH_ADMIN: 'Admin de sucursal',
};
const STATUS: Record<string, { label: string; tone: string }> = {
  UNDER_REVIEW: { label: 'En revisión', tone: 'amber' },
  PENDING: { label: 'Pendiente', tone: 'amber' },
  APPROVED: { label: 'Verificado', tone: 'green' },
  REJECTED: { label: 'Rechazado', tone: 'red' },
};

export default function Veterinarios() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-kyc'], queryFn: () => api<KycResp>('/admin/staff-kyc'), refetchInterval: 20000 });

  const mutation = useMutation({
    mutationFn: (v: { id: string; action: string }) => api(`/admin/staff-kyc/${v.id}/review`, { method: 'POST', body: { action: v.action } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-kyc'] }); setSelectedId(null); },
  });

  const pending = (data?.data ?? []).filter((k) => k.status === 'UNDER_REVIEW' || k.status === 'PENDING');
  const processed = (data?.data ?? []).filter((k) => k.status === 'APPROVED' || k.status === 'REJECTED');
  const selected = pending.find((k) => k.id === selectedId) ?? pending[0] ?? null;

  return (
    <div>
      <PageHeader
        title="Verificación de Personal"
        subtitle="Revisa la identidad y credenciales del personal que solicita ingresar (veterinarios, peluqueros, etc.)."
        actions={data ? <span className="rounded-full bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700">En revisión: {data.counts.review}</span> : null}
      />

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : error ? (
        <ErrorNote error={error} />
      ) : data ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            {!selected ? (
              <div className="py-16 text-center text-slate-400">✅ No hay solicitudes pendientes de verificación.</div>
            ) : (
              <div>
                <div className="flex items-center gap-4 border-b border-slate-100 pb-5">
                  {selected.selfieUrl ? (
                    <img src={selected.selfieUrl} alt="selfie" className="h-16 w-16 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-100 text-2xl font-bold text-migo-purple">{selected.user.fullName[0]}</div>
                  )}
                  <div className="flex-1">
                    <div className="text-xl font-bold text-slate-900">{selected.user.fullName}</div>
                    <div className="text-sm text-slate-500">{selected.user.email}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge tone="purple">{POSITION[selected.requestedPosition] ?? selected.requestedPosition}</Badge>
                      <span className="text-xs text-slate-400">Cédula: {selected.user.nationalId ?? '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Documentos capturados */}
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <DocBox label="Selfie" src={selected.selfieUrl} />
                  <DocBox label="Cédula" src={selected.idDocumentUrl} />
                  {selected.requestedPosition === 'VET' && <DocBox label="Carnet CMV" src={selected.cmvCardUrl} />}
                </div>

                {/* Face-match */}
                <div className="mt-5 flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                  <Icon name="shield" className="h-5 w-5 text-migo-purple" />
                  <div className="flex-1 text-sm">
                    <span className="font-semibold text-slate-700">Face-match automático: </span>
                    {selected.faceMatchScore != null ? (
                      <span className={selected.faceMatchPassed ? 'text-green-600' : 'text-red-600'}>
                        {selected.faceMatchPassed ? 'Coincide' : 'No coincide'} (score {selected.faceMatchScore.toFixed(2)})
                      </span>
                    ) : (
                      <span className="text-slate-400">Sin auto-verificación — requiere revisión manual</span>
                    )}
                  </div>
                </div>

                {selected.requestedPosition === 'VET' && (
                  <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">N° de colegiado (CMV)</div><div className="mt-1 font-medium text-slate-700">{selected.collegiateNumber ?? '—'}</div></div>
                    <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Especialidad</div><div className="mt-1 font-medium text-slate-700">{selected.specialty ?? '—'}</div></div>
                  </div>
                )}

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button disabled={mutation.isPending} onClick={() => mutation.mutate({ id: selected.id, action: 'approve' })} className="flex items-center justify-center gap-2 rounded-xl bg-green-500 py-3 font-semibold text-white hover:bg-green-600 disabled:opacity-60">
                    <Icon name="check" className="h-5 w-5" />Aprobar identidad
                  </button>
                  <button disabled={mutation.isPending} onClick={() => mutation.mutate({ id: selected.id, action: 'reject' })} className="flex items-center justify-center gap-2 rounded-xl bg-red-500 py-3 font-semibold text-white hover:bg-red-600 disabled:opacity-60">
                    <Icon name="close" className="h-5 w-5" />Rechazar
                  </button>
                </div>
                {mutation.isError && <div className="mt-3"><ErrorNote error={mutation.error} /></div>}

                {pending.length > 1 && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-50 pt-4">
                    {pending.map((k) => (
                      <button key={k.id} onClick={() => setSelectedId(k.id)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${selected.id === k.id ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>{k.user.fullName}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card className="self-start">
            <SectionTitle>Recientemente procesados</SectionTitle>
            <div className="space-y-3">
              {processed.length === 0 && <p className="text-sm text-slate-400">Aún no hay procesados.</p>}
              {processed.map((k) => {
                const st = STATUS[k.status];
                return (
                  <div key={k.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
                    <span className={`h-2 w-2 rounded-full ${k.status === 'APPROVED' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-800">{k.user.fullName}</div>
                      <div className="text-xs text-slate-400">{POSITION[k.requestedPosition] ?? k.requestedPosition} · {k.user.nationalId ?? '—'}</div>
                    </div>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function DocBox({ label, src }: { label: string; src?: string | null }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      {src ? (
        <img src={src} alt={label} className="h-28 w-full rounded-xl border border-slate-200 object-cover" />
      ) : (
        <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-300"><Icon name="image" className="h-9 w-9" /></div>
      )}
    </div>
  );
}
