import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Card, ErrorNote, PageHeader, SectionTitle, Spinner } from '../components/ui';

interface Emergency {
  id: string;
  status: string;
  triageLevel?: string | null;
  report: string;
  pet: string;
  species: string;
  owner: string;
  clinic: string | null;
  createdAt: string;
}
interface EmgResp {
  activeCount: number;
  feed: Emergency[];
  metrics: { clinic: string; attended: number; avgResponseSec: number | null }[];
}

const STATUS: Record<string, { label: string; tone: string; dot: string }> = {
  TRIAGING: { label: 'Triaje', tone: 'amber', dot: 'bg-amber-400' },
  BROADCASTING: { label: 'Notificada', tone: 'amber', dot: 'bg-amber-400' },
  ACCEPTED: { label: 'Aceptada', tone: 'blue', dot: 'bg-blue-400' },
  EN_ROUTE: { label: 'En ruta', tone: 'blue', dot: 'bg-blue-400' },
  ATTENDED: { label: 'En atención', tone: 'red', dot: 'bg-red-400' },
  HOSPITALIZED: { label: 'Hospitalizado', tone: 'red', dot: 'bg-red-500' },
  CANCELLED: { label: 'Cancelada', tone: 'slate', dot: 'bg-slate-300' },
  EXPIRED: { label: 'Expirada', tone: 'slate', dot: 'bg-slate-300' },
};

const ago = (d: string) => {
  const min = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (min < 60) return `Hace ${min} min`;
  const h = Math.round(min / 60);
  return `Hace ${h} h`;
};

export default function Emergencias() {
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-emergencies'], queryFn: () => api<EmgResp>('/admin/emergencies'), refetchInterval: 15000 });

  return (
    <div>
      <PageHeader
        title="Monitor de Emergencias en Vivo"
        subtitle="Panel central de control y despacho para triajes de emergencias en tiempo real."
        actions={data ? <span className="rounded-full bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-600">● En vivo — {data.activeCount} activas</span> : null}
      />

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : error ? (
        <ErrorNote error={error} />
      ) : data ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <h2 className="text-lg font-bold text-migo-heading">Feed de Alertas Activas</h2>
            {data.feed.length === 0 && <Card><p className="text-sm text-slate-400">Sin emergencias registradas.</p></Card>}
            {data.feed.map((e) => {
              const st = STATUS[e.status] ?? STATUS.TRIAGING;
              return (
                <Card key={e.id}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs text-slate-400"><i className={`h-2.5 w-2.5 rounded-full ${st.dot}`} />{ago(e.createdAt)}</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <div className="font-bold text-slate-900">Mascota: {e.pet} ({e.species}) · Dueño: {e.owner}</div>
                  <div className="mt-1 text-sm text-slate-600"><span className="font-semibold">Reporte:</span> {e.report}</div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-50 pt-3 text-sm">
                    <span className="text-slate-500">Clínica: <span className="font-semibold text-slate-700">{e.clinic ?? 'Sin asignar'}</span></span>
                  </div>
                </Card>
              );
            })}
          </div>

          <Card className="self-start">
            <SectionTitle>Métricas de Respuesta</SectionTitle>
            {data.metrics.length === 0 ? (
              <p className="text-sm text-slate-400">Sin datos de respuesta aún.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 font-semibold">Clínica</th>
                    <th className="py-2 text-right font-semibold">Respuesta</th>
                    <th className="py-2 text-right font-semibold">Atendidas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.metrics.map((m, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-2.5 font-medium text-slate-700">{m.clinic}</td>
                      <td className="py-2.5 text-right font-bold text-amber-600">{m.avgResponseSec != null ? `${m.avgResponseSec}s` : '—'}</td>
                      <td className="py-2.5 text-right text-slate-600">{m.attended}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
