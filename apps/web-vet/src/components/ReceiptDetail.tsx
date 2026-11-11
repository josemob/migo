import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { usd } from '../lib/format';
import { ErrorNote, Spinner } from './ui';
import { Icon } from './Icon';

interface ReceiptDetailData {
  id: string;
  number: string;
  issuedAt: string;
  concept: string;
  amountUsd: number;
  source: 'APP' | 'MANUAL';
  paymentMethod?: string | null;
  clinicName?: string | null;
  owner: { fullName: string; nationalId?: string | null; phone?: string | null; email: string };
  pet?: { name: string; breed?: string | null; species?: string | null } | null;
  appointment?: {
    id: string;
    scheduledAt: string;
    service?: string | null;
    status: string;
    paidInApp: boolean;
    vetName?: string | null;
    recordId?: string | null;
    recordSigned: boolean;
    invoiceId?: string | null;
  } | null;
  migoFeeUsd: number | null;
  netUsd: number;
}

const SPECIES: Record<string, string> = {
  DOG: 'Perro', CAT: 'Gato', BIRD: 'Ave', RABBIT: 'Conejo', REPTILE: 'Reptil', RODENT: 'Roedor', OTHER: 'Otra especie',
};
const longDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-VE', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function originLabel(r: ReceiptDetailData): { label: string; tone: string } {
  if (r.source === 'APP' || r.appointment?.paidInApp) return { label: 'Pagado en la app', tone: 'bg-green-100 text-green-700' };
  if (r.appointment) return { label: 'Pagado en el local', tone: 'bg-brand-50 text-migo-purple' };
  return { label: 'Recibo manual', tone: 'bg-slate-100 text-slate-600' };
}

/** Panel lateral con el comprobante completo de un cliente atendido. */
export function ReceiptDrawer({
  receiptId,
  onClose,
  onOpenRecord,
}: {
  receiptId: string | null;
  onClose: () => void;
  /** Abre el informe de consulta de la cita (si existe). */
  onOpenRecord?: (recordId: string) => void;
}) {
  const open = !!receiptId;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const { data: r, isLoading, error } = useQuery({
    queryKey: ['receipt-detail', receiptId],
    queryFn: () => api<ReceiptDetailData>(`/finance/receipts/${receiptId}`),
    enabled: open,
  });

  if (!open) return null;
  const origin = r ? originLabel(r) : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl sm:m-3 sm:h-[calc(100%-1.5rem)] sm:rounded-shell"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Comprobante"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-7 py-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Comprobante</p>
            <h2 className="mt-1 font-mono text-2xl font-bold text-brand-900">{r?.number ?? '…'}</h2>
            {r && <p className="mt-1 text-sm text-slate-500">{longDateTime(r.issuedAt)}</p>}
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto px-7 py-6">
          {isLoading && <Spinner className="mx-auto my-10" />}
          {error && <ErrorNote error={error} />}
          {r && origin && (
            <>
              {/* Monto */}
              <div className="mb-6 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 px-5 py-5 text-white">
                <div className="text-xs font-semibold uppercase tracking-wide text-white/70">{r.concept}</div>
                <div className="mt-1 font-heading text-4xl font-extrabold">{usd(r.amountUsd)}</div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className={`rounded-full px-2.5 py-1 font-bold ${origin.tone}`}>{origin.label}</span>
                  {r.paymentMethod && !['app', 'en el local'].includes(r.paymentMethod.toLowerCase()) && (
                    <span className="rounded-full bg-white/15 px-2.5 py-1 font-semibold capitalize">{r.paymentMethod}</span>
                  )}
                </div>
              </div>

              <Section title="Cliente">
                <Row label="Nombre" value={r.owner.fullName} strong />
                <Row label="Cédula" value={r.owner.nationalId} />
                <Row label="Teléfono" value={r.owner.phone} />
                <Row label="Correo" value={r.owner.email} />
              </Section>

              {r.pet && (
                <Section title="Mascota">
                  <Row label="Nombre" value={r.pet.name} strong />
                  <Row label="Especie / raza" value={[r.pet.species ? SPECIES[r.pet.species] : null, r.pet.breed].filter(Boolean).join(' · ') || null} />
                </Section>
              )}

              {r.appointment && (
                <Section title="Cita">
                  <Row label="Fecha" value={longDateTime(r.appointment.scheduledAt)} />
                  <Row label="Servicio" value={r.appointment.service} strong />
                  <Row label="Atendió" value={r.appointment.vetName} />
                  {r.appointment.recordId && onOpenRecord && (
                    <button
                      type="button"
                      onClick={() => onOpenRecord(r.appointment!.recordId!)}
                      className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-migo-purple hover:underline"
                    >
                      Ver informe de consulta{r.appointment.recordSigned ? '' : ' (borrador)'}
                      <Icon name="chevronRight" className="h-4 w-4" />
                    </button>
                  )}
                </Section>
              )}

              <Section title="Liquidación">
                <Row label="Cobrado al cliente" value={usd(r.amountUsd)} />
                {r.migoFeeUsd != null && (
                  <Row
                    label={r.appointment?.paidInApp ? 'Comisión Migo (retenida)' : 'Comisión Migo (en tu factura del mes)'}
                    value={`− ${usd(r.migoFeeUsd)}`}
                  />
                )}
                <div className="mt-2 flex items-baseline justify-between border-t border-slate-100 pt-3">
                  <span className="text-sm font-semibold text-slate-700">Neto para la clínica</span>
                  <span className="font-heading text-xl font-extrabold text-brand-900">{usd(r.netUsd)}</span>
                </div>
              </Section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-migo-purple">{title}</h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value?: string | null; strong?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className={`min-w-0 truncate text-right ${strong ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>{value}</span>
    </div>
  );
}
