import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Card, ErrorNote, PageHeader, Spinner } from '../components/ui';
import { Icon } from '../components/Icon';

interface DocItem { type: string; label?: string; url: string }
interface SpecReq {
  id: string;
  requestedSpecialty: string;
  documents: DocItem[];
  createdAt: string;
  currentSpecialty: string | null;
  collegiateNumber: string | null;
  vetName: string;
  vetEmail: string;
}
interface Resp { data: SpecReq[]; count: number }

export default function Especialidades() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-specialty-requests'],
    queryFn: () => api<Resp>('/admin/specialty-requests'),
    refetchInterval: 20000,
  });

  const mutation = useMutation({
    mutationFn: (v: { id: string; action: 'approve' | 'reject'; notes?: string }) =>
      api(`/admin/specialty-requests/${v.id}/review`, { method: 'POST', body: { action: v.action, notes: v.notes } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-specialty-requests'] }),
  });

  const reject = (id: string) => {
    const notes = window.prompt('Motivo del rechazo (opcional):') ?? undefined;
    mutation.mutate({ id, action: 'reject', notes });
  };

  const requests = data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Solicitudes de Especialidad"
        subtitle="Los veterinarios envían sus especialidades avaladas con documentos (carnet, postgrado, etc.). Aprueba para aplicarlas a su perfil."
        actions={data ? <span className="rounded-full bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700">Pendientes: {data.count}</span> : null}
      />

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : error ? (
        <ErrorNote error={error} />
      ) : requests.length === 0 ? (
        <Card><div className="py-16 text-center text-slate-400">✅ No hay solicitudes de especialidad pendientes.</div></Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {requests.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="text-lg font-bold text-slate-900">{r.vetName}</div>
                  <div className="text-sm text-slate-500">{r.vetEmail}</div>
                  {r.collegiateNumber && <div className="text-xs text-slate-400">Colegiado: {r.collegiateNumber}</div>}
                </div>
                <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Actual</div>
                  <div className="mt-1 text-slate-600">{r.currentSpecialty || '—'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Solicitada</div>
                  <div className="mt-1 font-semibold text-migo-purple">{r.requestedSpecialty}</div>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Documentos ({r.documents.length})</div>
                <div className="flex flex-wrap gap-3">
                  {r.documents.map((d, i) => (
                    <div key={i} className="w-28">
                      {d.url.startsWith('data:image') ? (
                        <a href={d.url} target="_blank" rel="noreferrer">
                          <img src={d.url} alt={d.type} className="h-24 w-28 rounded-lg border border-slate-200 object-cover" />
                        </a>
                      ) : (
                        <a href={d.url} target="_blank" rel="noreferrer" className="flex h-24 w-28 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100">
                          <span className="text-2xl">📄</span>
                          <span className="text-[10px]">Ver documento</span>
                        </a>
                      )}
                      <div className="mt-1 truncate text-center text-[11px] text-slate-500" title={`${d.type}${d.label ? ' · ' + d.label : ''}`}>
                        <Badge tone="purple">{d.type}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ id: r.id, action: 'approve' })}
                  className="flex items-center justify-center gap-2 rounded-xl bg-green-500 py-2.5 font-semibold text-white hover:bg-green-600 disabled:opacity-60"
                >
                  <Icon name="check" className="h-5 w-5" />Aprobar
                </button>
                <button
                  disabled={mutation.isPending}
                  onClick={() => reject(r.id)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 font-semibold text-white hover:bg-red-600 disabled:opacity-60"
                >
                  <Icon name="close" className="h-5 w-5" />Rechazar
                </button>
              </div>
            </Card>
          ))}
          {mutation.isError && <ErrorNote error={mutation.error} />}
        </div>
      )}
    </div>
  );
}
