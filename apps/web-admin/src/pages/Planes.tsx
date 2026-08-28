import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Card, ErrorNote, PageHeader, SectionTitle, Spinner } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';

interface Plan {
  id: string; audience: 'VET' | 'CLINIC'; code: string; name: string;
  priceUsd: number; commissionRate: number; billingPeriod: string;
  maxPatients: number | null; maxSpecialists: number | null;
  highlight: string | null; sortOrder: number; isActive: boolean; isDefault: boolean;
}
type Draft = { priceUsd: number; commissionRate: number; maxPatients: number | null; maxSpecialists: number | null; highlight: string; isActive: boolean };

function TitleIcon({ name, children }: { name: IconName; children: string }) {
  return <span className="flex items-center gap-2"><Icon name={name} className="h-5 w-5 text-migo-purple" />{children}</span>;
}

function PlanRow({ plan }: { plan: Plan }) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>({
    priceUsd: plan.priceUsd, commissionRate: Math.round(plan.commissionRate * 100),
    maxPatients: plan.maxPatients, maxSpecialists: plan.maxSpecialists,
    highlight: plan.highlight ?? '', isActive: plan.isActive,
  });
  useEffect(() => {
    setD({ priceUsd: plan.priceUsd, commissionRate: Math.round(plan.commissionRate * 100),
      maxPatients: plan.maxPatients, maxSpecialists: plan.maxSpecialists, highlight: plan.highlight ?? '', isActive: plan.isActive });
  }, [plan]);

  const save = useMutation({
    mutationFn: () => api(`/admin/plans/${plan.id}`, { method: 'PATCH', body: {
      priceUsd: d.priceUsd, commissionRate: d.commissionRate / 100,
      maxPatients: d.maxPatients, maxSpecialists: plan.audience === 'CLINIC' ? d.maxSpecialists : undefined,
      highlight: d.highlight || null, isActive: d.isActive,
    } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-plans'] }),
  });

  const limitField = plan.audience === 'VET'
    ? { label: 'Pacientes', value: d.maxPatients, set: (v: number | null) => setD((s) => ({ ...s, maxPatients: v })) }
    : { label: 'Especialistas', value: d.maxSpecialists, set: (v: number | null) => setD((s) => ({ ...s, maxSpecialists: v })) };

  return (
    <tr className="border-b border-slate-50 align-middle">
      <td className="py-3 pr-3">
        <div className="flex items-center gap-2 font-semibold text-slate-800">{plan.name}
          {plan.isDefault && <Badge tone="slate">Base</Badge>}
        </div>
        <div className="text-xs text-slate-400">{plan.code}</div>
      </td>
      <td className="py-3 pr-3">
        <div className="flex items-center gap-1">
          <span className="text-slate-400">$</span>
          <input type="number" min={0} step={1} value={d.priceUsd}
            onChange={(e) => setD((s) => ({ ...s, priceUsd: Number(e.target.value) }))}
            className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand-500" />
          <span className="text-xs text-slate-400">/m</span>
        </div>
      </td>
      <td className="py-3 pr-3">
        <div className="flex items-center gap-1">
          <input type="number" min={0} max={100} step={1} value={d.commissionRate}
            onChange={(e) => setD((s) => ({ ...s, commissionRate: Number(e.target.value) }))}
            className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand-500" />
          <span className="text-xs text-slate-400">%</span>
        </div>
      </td>
      <td className="py-3 pr-3">
        <div className="flex items-center gap-1">
          <input type="number" min={0} placeholder="∞" value={limitField.value ?? ''}
            onChange={(e) => limitField.set(e.target.value === '' ? null : Number(e.target.value))}
            className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand-500" />
          <span className="text-xs text-slate-400">{limitField.value == null ? 'ilim.' : limitField.label.toLowerCase()}</span>
        </div>
      </td>
      <td className="py-3 pr-3">
        <input type="text" value={d.highlight} placeholder="—"
          onChange={(e) => setD((s) => ({ ...s, highlight: e.target.value }))}
          className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand-500" />
      </td>
      <td className="py-3 pr-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={d.isActive} onChange={(e) => setD((s) => ({ ...s, isActive: e.target.checked }))} className="h-4 w-4 accent-migo-purple" />
          <span className="text-xs text-slate-500">{d.isActive ? 'Activo' : 'Oculto'}</span>
        </label>
      </td>
      <td className="py-3 text-right">
        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
          {save.isPending ? '…' : 'Guardar'}
        </button>
        {save.isSuccess && <div className="mt-1 text-[10px] text-green-600">Guardado</div>}
        {save.isError && <div className="mt-1 text-[10px] text-red-600">Error</div>}
      </td>
    </tr>
  );
}

function PlanTable({ title, icon, plans }: { title: string; icon: IconName; plans: Plan[] }) {
  return (
    <Card className="mt-6">
      <SectionTitle><TitleIcon name={icon}>{title}</TitleIcon></SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-3 pr-3 font-semibold">Plan</th>
              <th className="py-3 pr-3 font-semibold">Precio</th>
              <th className="py-3 pr-3 font-semibold">Comisión</th>
              <th className="py-3 pr-3 font-semibold">Límite</th>
              <th className="py-3 pr-3 font-semibold">Etiqueta directorio</th>
              <th className="py-3 pr-3 font-semibold">Estado</th>
              <th className="py-3 font-semibold text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {plans.sort((a, b) => a.sortOrder - b.sortOrder).map((p) => <PlanRow key={p.id} plan={p} />)}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function Planes() {
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-plans'], queryFn: () => api<{ data: Plan[] }>('/admin/plans') });
  const plans = data?.data ?? [];
  const vets = plans.filter((p) => p.audience === 'VET');
  const clinics = plans.filter((p) => p.audience === 'CLINIC');

  return (
    <div>
      <PageHeader title="Planes & Suscripciones" subtitle="Configura el catálogo de planes: precio, comisión que retiene Migo, límites y posicionamiento. La comisión de cada plan se aplica automáticamente. El cobro con pasarela se conectará después." />
      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : error ? (
        <ErrorNote error={error} />
      ) : (
        <>
          <PlanTable title="Profesionales Independientes" icon="hospital" plans={vets} />
          <PlanTable title="Establecimientos (Clínicas y Comercios)" icon="store" plans={clinics} />
          <p className="mt-4 text-xs text-slate-400">La <b>comisión</b> se guarda como porcentaje y se aplica a las transacciones bajo ese plan. Cambiarla re-sincroniza a las clínicas que ya lo tienen activo. Deja el <b>límite</b> vacío para “ilimitado”.</p>
        </>
      )}
    </div>
  );
}
