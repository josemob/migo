import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, ErrorNote, PageHeader, SectionTitle, Spinner, StatCard } from '../components/ui';

interface Overview {
  comerciosActivos: number;
  emergenciasHoy: number;
  gmvMensual: number;
  revenueMigo: number;
  vetsGuardia: number;
  solicitudes: number;
  suspendidos: number;
  trend: { label: string; revenue: number; emergencies: number }[];
}

const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export default function General() {
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-overview'], queryFn: () => api<Overview>('/admin/overview') });

  return (
    <div>
      <PageHeader
        title="Consola de Control"
        subtitle="Monitoreo global de operaciones MIGO, métricas de rendimiento y salud de la red."
        actions={
          <span className="rounded-full bg-green-100 px-3 py-1.5 text-sm font-semibold text-green-700">● Estado del sistema: online</span>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : error ? (
        <ErrorNote error={error} />
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Comercios Activos" value={`${data.comerciosActivos} Clínicas`} icon="🏪" />
            <StatCard label="Emergencias Hoy" value={`${data.emergenciasHoy} Alertas`} icon="🚨" />
            <StatCard label="GMV Mensual" value={usd(data.gmvMensual)} icon="📊" hint="Volumen transado" />
            <StatCard label="Revenue Migo" value={usd(data.revenueMigo)} icon="💳" hint="Comisiones + leads" />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <SectionTitle>Tendencias Semanales</SectionTitle>
              <TrendChart trend={data.trend} />
              <div className="mt-4 flex items-center gap-5 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-brand-500" /> Emergencias atendidas</span>
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#FB7B54]" /> Revenue diario ($)</span>
              </div>
            </Card>

            <Card>
              <SectionTitle>Salud de la Red</SectionTitle>
              <div className="grid grid-cols-1 gap-3">
                <MiniStat icon="🩺" label="Veterinarios (red)" value={`${data.vetsGuardia}`} hint="Registrados en la plataforma" />
                <MiniStat icon="🟡" label="Solicitudes pendientes" value={`${data.solicitudes}`} hint="Comercios por verificar" />
                <MiniStat icon="🔴" label="Comercios suspendidos" value={`${data.suspendidos}`} hint="Por mora o rechazo" />
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

function TrendChart({ trend }: { trend: Overview['trend'] }) {
  const maxRev = Math.max(1, ...trend.map((t) => t.revenue));
  const maxEmg = Math.max(1, ...trend.map((t) => t.emergencies));
  return (
    <div className="flex h-48 items-end justify-between gap-3">
      {trend.map((t, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-2">
          <div className="flex h-40 w-full items-end justify-center gap-1">
            <div className="w-2.5 rounded-t bg-brand-500" style={{ height: `${(t.emergencies / maxEmg) * 100}%` }} title={`${t.emergencies} emergencias`} />
            <div className="w-2.5 rounded-t bg-[#FB7B54]" style={{ height: `${(t.revenue / maxRev) * 100}%` }} title={`$${t.revenue}`} />
          </div>
          <span className="text-xs text-slate-400">{t.label}</span>
        </div>
      ))}
    </div>
  );
}

function MiniStat({ icon, label, value, hint }: { icon: string; label: string; value: string; hint: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
      <span className="text-xl">{icon}</span>
      <div className="flex-1">
        <div className="text-sm font-semibold text-slate-700">{label}</div>
        <div className="text-xs text-slate-400">{hint}</div>
      </div>
      <div className="text-xl font-extrabold text-slate-900">{value}</div>
    </div>
  );
}
