import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, SectionTitle, Spinner, ErrorNote } from './ui';
import { Icon } from './Icon';

interface Plan {
  id: string; name: string; priceUsd: number; commissionRate: number;
  maxSpecialists: number | null; highlight: string | null; isDefault: boolean;
}
interface PlanResp { current: Plan | null; pending: Plan | null; available: Plan[] }

const pct = (r: number) => `${Math.round(r * 100)}%`;

export function PlanSection() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['clinic-plan'], queryFn: () => api<PlanResp>('/clinic/plan') });

  const select = useMutation({
    mutationFn: (planId: string) => api<{ ok: boolean; applied: boolean }>('/clinic/plan/select', { method: 'POST', body: { planId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic-plan'] }),
  });

  return (
    <Card className="mb-6">
      <SectionTitle>
        <span className="flex items-center gap-2"><Icon name="finance" className="h-5 w-5 text-migo-purple" />Plan del establecimiento</span>
      </SectionTitle>
      <p className="mb-4 text-sm text-slate-500">
        Elige el plan de tu sucursal. La comisión que retiene Migo depende del plan. El cobro dentro del panel se habilitará
        próximamente: al elegir un plan de pago, tu solicitud queda <b>pendiente de pago</b> y se activa cuando esté la pasarela.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : error ? (
        <ErrorNote error={error} />
      ) : data ? (
        <>
          {data.pending && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Elegiste <b>{data.pending.name}</b> · pendiente de pago. Se activará cuando habilitemos el cobro en el panel.
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {data.available.map((p) => {
              const isCurrent = data.current?.id === p.id;
              const isPending = data.pending?.id === p.id;
              return (
                <div key={p.id} className={`rounded-2xl border p-4 ${isCurrent ? 'border-migo-purple bg-migo-purple/5' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-slate-800">{p.name}</span>
                      {p.highlight && <span className="rounded-full bg-migo-purple px-2 py-0.5 text-[10px] font-bold text-white">{p.highlight}</span>}
                    </div>
                    <span className="font-bold text-migo-purple">{p.priceUsd > 0 ? `$${p.priceUsd}/m` : 'Gratis'}</span>
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-slate-500">
                    <div>Comisión Migo: <b className="text-slate-700">{pct(p.commissionRate)}</b></div>
                    <div>Especialistas: {p.maxSpecialists == null ? 'ilimitados' : `hasta ${p.maxSpecialists}`}</div>
                  </div>
                  {isCurrent ? (
                    <div className="mt-4 rounded-lg bg-slate-100 py-2 text-center text-sm font-semibold text-slate-500">Plan actual</div>
                  ) : (
                    <button
                      onClick={() => select.mutate(p.id)}
                      disabled={select.isPending}
                      className="mt-4 w-full rounded-lg bg-brand-500 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                    >
                      {isPending ? 'Pendiente de pago' : p.priceUsd > 0 ? 'Elegir (pendiente de pago)' : 'Elegir plan gratis'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {select.isError && <p className="mt-3 text-sm text-red-600">No se pudo cambiar el plan. Intenta de nuevo.</p>}
        </>
      ) : null}
    </Card>
  );
}
