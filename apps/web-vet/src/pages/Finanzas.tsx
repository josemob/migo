import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { usd, date } from '../lib/format';
import { Card, PageHeader, SectionTitle, Spinner, Badge, ErrorNote } from '../components/ui';
import { Modal, Field } from '../components/Modal';
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
interface Invoice {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: 'OPEN' | 'ISSUED' | 'PAID' | 'OVERDUE' | 'VOID';
  leadCount: number;
  cplSubtotalUsd: string | number;
  planSubtotalUsd: string | number;
  totalUsd: string | number;
  dueAt?: string | null;
  paidAt?: string | null;
  reference?: string | null;
}
interface Payout {
  id: string;
  periodStart: string;
  periodEnd: string;
  amountUsd: string | number;
  status: 'DRAFT' | 'PROCESSING' | 'PAID' | 'FAILED';
  processedAt?: string | null;
  reference?: string | null;
}
interface Settlement {
  bankName: string;
  accountType: string;
  accountLast4?: string;
  holderName?: string;
  holderIdNumber?: string;
  c2pEnabled: boolean;
  mobilePayPhone?: string;
}

const INVOICE_TONE: Record<Invoice['status'], 'green' | 'red' | 'amber' | 'blue' | 'slate'> = {
  PAID: 'green',
  OVERDUE: 'red',
  ISSUED: 'amber',
  OPEN: 'blue',
  VOID: 'slate',
};
const INVOICE_LABEL: Record<Invoice['status'], string> = {
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
  ISSUED: 'Emitida',
  OPEN: 'Abierta',
  VOID: 'Anulada',
};
const PAYOUT_TONE: Record<Payout['status'], 'green' | 'red' | 'amber' | 'slate'> = {
  PAID: 'green',
  FAILED: 'red',
  PROCESSING: 'amber',
  DRAFT: 'slate',
};
const PAYOUT_LABEL: Record<Payout['status'], string> = {
  PAID: 'Pagada',
  FAILED: 'Fallida',
  PROCESSING: 'En proceso',
  DRAFT: 'Borrador',
};

export default function Finanzas() {
  const qc = useQueryClient();
  const summary = useQuery({ queryKey: ['finance-summary'], queryFn: () => api<FinanceSummary>('/finance/summary') });
  const cpl = useQuery({ queryKey: ['finance-cpl'], queryFn: () => api<{ data: CplRow[] }>('/finance/cpl') });
  const invoices = useQuery({ queryKey: ['finance-invoices'], queryFn: () => api<{ data: Invoice[] }>('/finance/invoices') });
  const payouts = useQuery({ queryKey: ['finance-payouts'], queryFn: () => api<{ data: Payout[] }>('/finance/payouts') });
  const settlement = useQuery({ queryKey: ['settlement'], queryFn: () => api<Settlement | null>('/finance/settlement') });

  const [payId, setPayId] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [editSettlement, setEditSettlement] = useState(false);

  const payInvoice = useMutation({
    mutationFn: (id: string) => api(`/finance/invoices/${id}/pay`, { method: 'POST', body: { reference: reference.trim() || undefined } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-invoices'] });
      qc.invalidateQueries({ queryKey: ['finance-summary'] });
      setPayId(null);
      setReference('');
    },
  });

  return (
    <div>
      <PageHeader
        title="Finanzas & Facturación Migo"
        subtitle="Ingresos locales, comisiones del sistema, facturas de Migo y liquidaciones recibidas."
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

      {/* Facturas de Migo (CPL + plan) */}
      <Card className="mb-6">
        <SectionTitle>Facturas de Migo</SectionTitle>
        {invoices.isLoading && <Spinner className="mx-auto my-6" />}
        {invoices.error && <ErrorNote error={invoices.error} />}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-slate-400">
              <th className="pb-2 font-medium">Período</th>
              <th className="pb-2 font-medium">Leads</th>
              <th className="pb-2 font-medium">Vence</th>
              <th className="pb-2 font-medium">Estado</th>
              <th className="pb-2 text-right font-medium">Total</th>
              <th className="pb-2 text-right font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {invoices.data?.data.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400">
                  Aún no tienes facturas emitidas por Migo.
                </td>
              </tr>
            )}
            {invoices.data?.data.map((inv) => (
              <tr key={inv.id} className="border-b border-slate-50">
                <td className="py-3 text-slate-600">
                  {date(inv.periodStart)} – {date(inv.periodEnd)}
                </td>
                <td className="py-3 text-slate-500">{inv.leadCount}</td>
                <td className="py-3 text-slate-500">{inv.dueAt ? date(inv.dueAt) : '—'}</td>
                <td className="py-3">
                  <Badge tone={INVOICE_TONE[inv.status]}>{INVOICE_LABEL[inv.status]}</Badge>
                </td>
                <td className="py-3 text-right font-bold text-slate-800">{usd(Number(inv.totalUsd))}</td>
                <td className="py-3 text-right">
                  {inv.status === 'ISSUED' || inv.status === 'OVERDUE' ? (
                    <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => setPayId(inv.id)}>
                      Registrar pago
                    </button>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Liquidaciones (Migo -> clínica) */}
        <Card className="lg:col-span-2">
          <SectionTitle>Liquidaciones recibidas</SectionTitle>
          {payouts.isLoading && <Spinner className="mx-auto my-6" />}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-400">
                <th className="pb-2 font-medium">Período</th>
                <th className="pb-2 font-medium">Procesada</th>
                <th className="pb-2 font-medium">Referencia</th>
                <th className="pb-2 font-medium">Estado</th>
                <th className="pb-2 text-right font-medium">Monto</th>
              </tr>
            </thead>
            <tbody>
              {payouts.data?.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    Aún no has recibido liquidaciones.
                  </td>
                </tr>
              )}
              {payouts.data?.data.map((p) => (
                <tr key={p.id} className="border-b border-slate-50">
                  <td className="py-3 text-slate-600">
                    {date(p.periodStart)} – {date(p.periodEnd)}
                  </td>
                  <td className="py-3 text-slate-500">{p.processedAt ? date(p.processedAt) : '—'}</td>
                  <td className="py-3 text-slate-500">{p.reference ?? '—'}</td>
                  <td className="py-3">
                    <Badge tone={PAYOUT_TONE[p.status]}>{PAYOUT_LABEL[p.status]}</Badge>
                  </td>
                  <td className="py-3 text-right font-bold text-migo-green">{usd(Number(p.amountUsd))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Datos de liquidación */}
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
              {settlement.data.holderName && (
                <div className="text-sm text-slate-500">Titular: {settlement.data.holderName}</div>
              )}
              {settlement.data.c2pEnabled && (
                <div className="mt-1 text-sm text-migo-green">✓ Pago C2P Interbancario Habilitado</div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Sin datos de liquidación configurados.</p>
          )}
          <button className="btn-outline mt-4 w-full" onClick={() => setEditSettlement(true)}>
            Modificar Datos de Destino
          </button>
        </Card>
      </div>

      {/* Reporte de CPL */}
      <Card className="mt-6">
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

      {/* Modal: registrar pago de factura */}
      <Modal
        open={!!payId}
        onClose={() => setPayId(null)}
        title="Registrar pago de factura"
        footer={
          <>
            <button className="btn-outline" onClick={() => setPayId(null)}>
              Cancelar
            </button>
            <button className="btn-primary" disabled={payInvoice.isPending} onClick={() => payId && payInvoice.mutate(payId)}>
              {payInvoice.isPending ? 'Guardando…' : 'Confirmar pago'}
            </button>
          </>
        }
      >
        <Field label="Referencia (opcional)">
          <input
            className="input"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Nº de transferencia / Pago Móvil"
          />
        </Field>
        <p className="text-sm text-slate-500">Al confirmar, la factura se marca como pagada y se reactiva el radar si no quedan facturas vencidas.</p>
      </Modal>

      {/* Modal: datos de liquidación */}
      <SettlementModal open={editSettlement} onClose={() => setEditSettlement(false)} current={settlement.data ?? null} />
    </div>
  );
}

function SettlementModal({ open, onClose, current }: { open: boolean; onClose: () => void; current: Settlement | null }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Settlement>(
    current ?? { bankName: '', accountType: 'CHECKING', accountLast4: '', holderName: '', holderIdNumber: '', c2pEnabled: false, mobilePayPhone: '' },
  );
  const set = (patch: Partial<Settlement>) => setForm((f) => ({ ...f, ...patch }));

  const save = useMutation({
    mutationFn: () =>
      api('/finance/settlement', {
        method: 'PUT',
        body: {
          bankName: form.bankName.trim(),
          accountType: form.accountType,
          accountLast4: form.accountLast4?.trim() || undefined,
          holderName: form.holderName?.trim() || undefined,
          holderIdNumber: form.holderIdNumber?.trim() || undefined,
          c2pEnabled: form.c2pEnabled,
          mobilePayPhone: form.mobilePayPhone?.trim() || undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlement'] });
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Datos de liquidación"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={save.isPending || form.bankName.trim().length < 2} onClick={() => save.mutate()}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <Field label="Banco">
        <input className="input" value={form.bankName} onChange={(e) => set({ bankName: e.target.value })} placeholder="Ej: Banesco" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo de cuenta">
          <select className="input" value={form.accountType} onChange={(e) => set({ accountType: e.target.value })}>
            <option value="CHECKING">Corriente</option>
            <option value="SAVINGS">Ahorro</option>
          </select>
        </Field>
        <Field label="Últimos 4 dígitos">
          <input className="input" maxLength={4} value={form.accountLast4 ?? ''} onChange={(e) => set({ accountLast4: e.target.value })} placeholder="1234" />
        </Field>
      </div>
      <Field label="Titular">
        <input className="input" value={form.holderName ?? ''} onChange={(e) => set({ holderName: e.target.value })} placeholder="Nombre del titular" />
      </Field>
      <Field label="Cédula / RIF del titular">
        <input className="input" value={form.holderIdNumber ?? ''} onChange={(e) => set({ holderIdNumber: e.target.value })} placeholder="V-12345678" />
      </Field>
      <Field label="Teléfono Pago Móvil (opcional)">
        <input className="input" value={form.mobilePayPhone ?? ''} onChange={(e) => set({ mobilePayPhone: e.target.value })} placeholder="0412..." />
      </Field>
      <label className="mt-1 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={form.c2pEnabled} onChange={(e) => set({ c2pEnabled: e.target.checked })} />
        Pago C2P interbancario habilitado
      </label>
    </Modal>
  );
}
