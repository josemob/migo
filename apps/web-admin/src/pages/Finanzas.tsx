import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Card, ErrorNote, PageHeader, SectionTitle, Spinner, StatCard } from '../components/ui';

interface Finance {
  cplTotal: number;
  comisionesRetenidas: number;
  liquidacionesPendientes: number;
  clinicasEnMora: number;
  detalleCpl: { clinic: string; leads: number; monto: number; mora: boolean }[];
  payouts: { id: string; clinic: string; amountUsd: number; bank: string; status: string }[];
}
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Finanzas() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-finance'], queryFn: () => api<Finance>('/admin/finance') });
  const approve = useMutation({
    mutationFn: (id: string) => api(`/admin/payouts/${id}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-finance'] }),
  });

  return (
    <div>
      <PageHeader title="Finanzas, CPL & Liquidaciones" subtitle="Facturación de leads de emergencias (CPL), comisiones de rutina y payouts a clínicas afiliadas." />

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : error ? (
        <ErrorNote error={error} />
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Facturación CPL Total" value={usd(data.cplTotal)} icon="📊" hint="Leads de emergencia" />
            <StatCard label="Comisiones Retenidas" value={usd(data.comisionesRetenidas)} icon="💳" hint="Por consultas de rutina" />
            <StatCard label="Liquidaciones Pendientes" value={usd(data.liquidacionesPendientes)} icon="⏳" hint="Para procesamiento" />
            <StatCard label="Clínicas en Mora" value={`${data.clinicasEnMora}`} icon="⚠️" hint="Requieren atención" />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <SectionTitle>Detalle de Cuentas por Clínica (CPL)</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-3 pr-4 font-semibold">Clínica Veterinaria</th>
                      <th className="py-3 pr-4 font-semibold">Leads Atendidos</th>
                      <th className="py-3 pr-4 font-semibold">Monto Facturado</th>
                      <th className="py-3 font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.detalleCpl.length === 0 ? (
                      <tr><td colSpan={4} className="py-10 text-center text-slate-400">Sin facturación CPL aún.</td></tr>
                    ) : (
                      data.detalleCpl.map((c, i) => (
                        <tr key={i} className="border-b border-slate-50">
                          <td className="py-3 pr-4 font-semibold text-slate-800">{c.clinic}</td>
                          <td className="py-3 pr-4 text-slate-500">{c.leads}</td>
                          <td className="py-3 pr-4 font-semibold text-slate-700">{usd(c.monto)}</td>
                          <td className="py-3">{c.mora ? <Badge tone="red">● Mora</Badge> : <Badge tone="green">● Al día</Badge>}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <SectionTitle>Payouts Pendientes</SectionTitle>
              {data.payouts.length === 0 ? (
                <p className="text-sm text-slate-400">No hay liquidaciones pendientes.</p>
              ) : (
                <div className="space-y-3">
                  {data.payouts.map((p) => (
                    <div key={p.id} className="rounded-xl border border-slate-100 p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{p.clinic}</span>
                        <span className="font-bold text-green-600">{usd(p.amountUsd)}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-400">{p.bank}</div>
                      <button
                        onClick={() => approve.mutate(p.id)}
                        disabled={approve.isPending}
                        className="mt-3 w-full rounded-xl bg-brand-500 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                      >
                        ✓ Aprobar Liquidación
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
