import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { usd, date } from '../lib/format';
import { Card, PageHeader, SectionTitle, Spinner, Badge, ErrorNote } from '../components/ui';
import { Icon } from '../components/Icon';

interface FinanceSummary {
  monthlyRevenueUsd: number;
  migoCommissionsUsd: number;
  cpl: { leads: number; totalUsd: number };
}
interface CplRow {
  id: string;
  date: string;
  pet?: { name: string; breed?: string };
  owner?: string;
  status?: string;
  amountUsd: number;
}
interface Settlement {
  bankName: string;
  accountType: string;
  accountLast4?: string;
  c2pEnabled: boolean;
}

export default function Finanzas() {
  const summary = useQuery({ queryKey: ['finance-summary'], queryFn: () => api<FinanceSummary>('/finance/summary') });
  const cpl = useQuery({ queryKey: ['finance-cpl'], queryFn: () => api<{ data: CplRow[] }>('/finance/cpl') });
  const settlement = useQuery({ queryKey: ['settlement'], queryFn: () => api<Settlement | null>('/finance/settlement') });

  return (
    <div>
      <PageHeader
        title="Finanzas & Facturación Migo"
        subtitle="Control de ingresos locales, comisiones del sistema integrado y reportes de telemedicina Migo."
      />

      {summary.isLoading && <Spinner className="mx-auto mt-10" />}
      {summary.error && <ErrorNote error={summary.error} />}

      {summary.data && (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <div className="text-sm text-slate-500">Ingresos Totales del Mes</div>
            <div className="mt-2 text-3xl font-extrabold text-slate-900">{usd(summary.data.monthlyRevenueUsd)}</div>
          </Card>
          <Card>
            <div className="text-sm text-slate-500">Retención / Comisiones Migo</div>
            <div className="mt-2 text-3xl font-extrabold text-migo-purple">{usd(summary.data.migoCommissionsUsd)}</div>
          </Card>
          <Card>
            <div className="text-sm text-slate-500">Facturación CPL Emergencias</div>
            <div className="mt-2 text-3xl font-extrabold text-migo-green">
              {usd(summary.data.cpl.totalUsd)}{' '}
              <span className="text-base font-medium text-slate-400">({summary.data.cpl.leads} Leads)</span>
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle>Reporte de CPL Emergencias (Canalizaciones)</SectionTitle>
          {cpl.isLoading && <Spinner className="mx-auto my-6" />}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-400">
                <th className="pb-2 font-medium">Fecha</th>
                <th className="pb-2 font-medium">Paciente</th>
                <th className="pb-2 font-medium">Dueño</th>
                <th className="pb-2 font-medium">Estado</th>
                <th className="pb-2 text-right font-medium">Monto Lead</th>
              </tr>
            </thead>
            <tbody>
              {cpl.data?.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    Aún no hay leads CPL registrados.
                  </td>
                </tr>
              )}
              {cpl.data?.data.map((r) => (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="py-3 text-slate-500">{date(r.date)}</td>
                  <td className="py-3 font-semibold text-slate-800">
                    {r.pet?.name} {r.pet?.breed && <span className="font-normal text-slate-400">({r.pet.breed})</span>}
                  </td>
                  <td className="py-3 text-slate-500">{r.owner}</td>
                  <td className="py-3">
                    <Badge tone="green">Atendido</Badge>
                  </td>
                  <td className="py-3 text-right font-bold text-migo-green">{usd(r.amountUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <SectionTitle>Datos de Liquidación local</SectionTitle>
          {settlement.data ? (
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <Icon name="finance" className="h-5 w-5 text-brand-600" /> {settlement.data.bankName}
              </div>
              <div className="text-sm text-slate-500">
                Cuenta: {settlement.data.accountType === 'CHECKING' ? 'Corriente' : 'Ahorro'} · ****
                {settlement.data.accountLast4}
              </div>
              {settlement.data.c2pEnabled && (
                <div className="mt-1 text-sm text-migo-green">✓ Pago C2P Interbancario Habilitado</div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Sin datos de liquidación configurados.</p>
          )}
          <button className="btn-outline mt-4 w-full">Modificar Datos de Destino</button>
        </Card>
      </div>
    </div>
  );
}
