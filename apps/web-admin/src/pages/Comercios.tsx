import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Card, ErrorNote, PageHeader, SectionTitle, Spinner } from '../components/ui';
import { Icon } from '../components/Icon';
import { Modal, inputCls } from '../components/Modal';

interface Clinic {
  id: string;
  name: string;
  representative: string;
  rif: string;
  orgName: string;
  legalName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  isOpen24_7: boolean;
  acceptsEmergencies: boolean;
  rejectionReason: string | null;
  plan: string;
  createdAt: string;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
}
interface ClinicsResp {
  data: Clinic[];
  counts: { solicitudes: number; activos: number; suspendidos: number };
}
interface Docs {
  rifDocUrl: string | null;
  sanitaryPermitUrl: string | null;
}

type Tab = 'PENDING' | 'ACTIVE' | 'SUSPENDED';
const TABS: { key: Tab; label: (c: ClinicsResp['counts']) => string; dot: string }[] = [
  { key: 'PENDING', label: (c) => `Solicitudes (${c.solicitudes})`, dot: 'bg-amber-400' },
  { key: 'ACTIVE', label: (c) => `Activos (${c.activos})`, dot: 'bg-green-500' },
  { key: 'SUSPENDED', label: (c) => `Suspendidos / rechazados (${c.suspendidos})`, dot: 'bg-red-500' },
];

const statusBadge = (c: Pick<Clinic, 'status' | 'verificationStatus'>) =>
  c.status === 'ACTIVE' ? <Badge tone="green">Activo</Badge>
    : c.verificationStatus === 'REJECTED' ? <Badge tone="red">Rechazado</Badge>
    : c.status === 'SUSPENDED' ? <Badge tone="red">Suspendido</Badge>
    : <Badge tone="amber">Solicitud</Badge>;

const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });

const QUICK_REASONS = [
  'La foto del RIF no se lee con claridad',
  'El RIF no coincide con el nombre comercial',
  'No pudimos verificar la dirección de la sede',
  'Faltan datos de contacto válidos',
];

/** Abre un documento (data URI) en otra pestaña. Chrome bloquea abrir data: directo, así que va como Blob. */
async function openDoc(dataUri: string) {
  const blob = await (await fetch(dataUri)).blob();
  window.open(URL.createObjectURL(blob), '_blank', 'noopener');
}

export default function Comercios() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('PENDING');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const { data, isLoading, error } = useQuery({ queryKey: ['admin-clinics'], queryFn: () => api<ClinicsResp>('/admin/clinics') });

  const mutation = useMutation({
    mutationFn: (v: { id: string; action: string; reason?: string }) =>
      api(`/admin/clinics/${v.id}/status`, { method: 'POST', body: { action: v.action, reason: v.reason } }),
    onSuccess: () => {
      setRejecting(false);
      void qc.invalidateQueries({ queryKey: ['admin-clinics'] });
    },
  });

  const rows = useMemo(() => (data?.data ?? []).filter((c) => c.status === tab), [data, tab]);
  const selected = rows.find((c) => c.id === selectedId) ?? rows[0] ?? null;

  const docs = useQuery({
    queryKey: ['admin-clinic-docs', selected?.id],
    queryFn: () => api<Docs>(`/admin/clinics/${selected!.id}/documents`),
    enabled: !!selected,
    staleTime: 5 * 60_000,
  });

  return (
    <div>
      <PageHeader title="Gestión de Comercios" subtitle="Administre las clínicas afiliadas, revise solicitudes de ingreso y controle estados de cuenta." />

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : error ? (
        <ErrorNote error={error} />
      ) : data ? (
        <>
          <div className="mb-6 flex flex-wrap gap-3">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setSelectedId(null); }}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                  tab === t.key ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <i className={`h-2.5 w-2.5 rounded-full ${t.dot}`} />
                {t.label(data.counts)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <SectionTitle>Registro de Clínicas y Solicitudes</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-3 pr-4 font-semibold">Nombre del Comercio</th>
                      <th className="py-3 pr-4 font-semibold">Representante</th>
                      <th className="py-3 pr-4 font-semibold">RIF</th>
                      <th className="py-3 pr-4 font-semibold">Fecha</th>
                      <th className="py-3 font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={5} className="py-10 text-center text-slate-400">Sin comercios en esta categoría.</td></tr>
                    ) : (
                      rows.map((c) => (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedId(c.id)}
                          className={`cursor-pointer border-b border-slate-50 transition hover:bg-slate-50 ${selected?.id === c.id ? 'bg-brand-50/50' : ''}`}
                        >
                          <td className="py-3 pr-4">
                            <div className="font-semibold text-slate-800">{c.orgName}</div>
                            <div className="text-xs text-slate-400">{c.name}{c.city ? ` · ${c.city}` : ''}</div>
                          </td>
                          <td className="py-3 pr-4 text-slate-500">{c.representative}</td>
                          <td className="py-3 pr-4 text-slate-500">{c.rif}</td>
                          <td className="py-3 pr-4 text-slate-500">{fmtDate(c.createdAt)}</td>
                          <td className="py-3">{statusBadge(c)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <SectionTitle>Auditoría de Local</SectionTitle>
              {!selected ? (
                <p className="text-sm text-slate-400">Selecciona un comercio de la lista.</p>
              ) : (
                <div>
                  <div className="text-lg font-bold text-slate-900">{selected.orgName}</div>
                  <div className="text-sm text-slate-500">Sucursal: {selected.name}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    RIF: {selected.rif}{selected.legalName ? ` · ${selected.legalName}` : ''} · Plan {selected.plan}
                  </div>

                  <div className="mt-5 space-y-2 text-sm">
                    <Row label="Estado actual">{statusBadge(selected)}</Row>
                    <Row label="Representante">{selected.representative}</Row>
                    {selected.ownerEmail && <Row label="Correo"><a className="text-brand-600 hover:underline" href={`mailto:${selected.ownerEmail}`}>{selected.ownerEmail}</a></Row>}
                    {(selected.ownerPhone || selected.phone) && <Row label="Teléfono">{selected.phone || selected.ownerPhone}</Row>}
                    <Row label="Solicitud">{fmtDate(selected.createdAt)}</Row>
                  </div>

                  {(selected.address || selected.city) && (
                    <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                      <div className="flex items-start gap-2">
                        <Icon name="pin" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <span>{[selected.address, selected.city, selected.state].filter(Boolean).join(', ')}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 pl-6">
                        {selected.isOpen24_7 && <Badge tone="purple">24/7</Badge>}
                        {selected.acceptsEmergencies && <Badge tone="amber">Acepta urgencias</Badge>}
                      </div>
                    </div>
                  )}

                  {selected.verificationStatus === 'REJECTED' && selected.rejectionReason && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                      <b>Motivo del rechazo:</b> {selected.rejectionReason}
                    </div>
                  )}

                  <div className="mt-5">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Documentos</div>
                    {docs.isLoading ? (
                      <Spinner />
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <DocThumb label="RIF" uri={docs.data?.rifDocUrl ?? null} />
                        <DocThumb label="Permiso sanitario" uri={docs.data?.sanitaryPermitUrl ?? null} />
                      </div>
                    )}
                  </div>

                  <div className="mt-6 space-y-2">
                    {selected.status !== 'ACTIVE' && (
                      <button
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate({ id: selected.id, action: selected.status === 'SUSPENDED' && selected.verificationStatus !== 'REJECTED' ? 'reactivate' : 'approve' })}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-2.5 font-semibold text-white transition hover:bg-green-600 disabled:opacity-60"
                      >
                        <Icon name="check" className="h-5 w-5" />
                        {selected.status === 'SUSPENDED' && selected.verificationStatus !== 'REJECTED' ? 'Reactivar Comercio' : 'Aprobar Comercio'}
                      </button>
                    )}
                    {selected.status === 'ACTIVE' && (
                      <button
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate({ id: selected.id, action: 'suspend' })}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
                      >
                        <Icon name="warning" className="h-5 w-5" />Suspender Servicio
                      </button>
                    )}
                    {selected.status === 'PENDING' && (
                      <button
                        disabled={mutation.isPending}
                        onClick={() => setRejecting(true)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 font-semibold text-white transition hover:bg-red-600 disabled:opacity-60"
                      >
                        <Icon name="close" className="h-5 w-5" />Rechazar (Con Motivo)
                      </button>
                    )}
                  </div>
                  {mutation.isError && !rejecting && <div className="mt-3"><ErrorNote error={mutation.error} /></div>}
                </div>
              )}
            </Card>
          </div>

          {rejecting && selected && (
            <RejectModal
              clinicName={selected.orgName}
              busy={mutation.isPending}
              error={mutation.isError ? mutation.error : null}
              onClose={() => { setRejecting(false); mutation.reset(); }}
              onConfirm={(reason) => mutation.mutate({ id: selected.id, action: 'reject', reason })}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-slate-700">{children}</span>
    </div>
  );
}

function DocThumb({ label, uri }: { label: string; uri: string | null }) {
  if (!uri) {
    return (
      <div className="flex h-28 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
        <span className="font-semibold">{label}</span>
        <span>No enviado</span>
      </div>
    );
  }
  const isPdf = uri.startsWith('data:application/pdf');
  return (
    <button
      type="button"
      onClick={() => void openDoc(uri)}
      className="group relative h-28 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left"
      title={`Abrir ${label}`}
    >
      {isPdf ? (
        <span className="flex h-full flex-col items-center justify-center gap-1 text-brand-600">
          <Icon name="document" className="h-6 w-6" />
          <span className="text-xs font-bold">PDF</span>
        </span>
      ) : (
        <img src={uri} alt={label} className="h-full w-full object-cover transition group-hover:scale-105" />
      )}
      <span className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-[11px] font-semibold text-white">{label} · Abrir</span>
    </button>
  );
}

function RejectModal({
  clinicName, busy, error, onClose, onConfirm,
}: {
  clinicName: string; busy: boolean; error: unknown; onClose: () => void; onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Modal title={`Rechazar ${clinicName}`} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500">La clínica recibirá este motivo por correo y lo verá en su panel para corregirlo.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {QUICK_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              reason === r ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder="Escribe el motivo…"
        className={inputCls}
      />
      {!!error && <div className="mt-3"><ErrorNote error={error} /></div>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancelar</button>
        <button
          disabled={busy || reason.trim().length < 5}
          onClick={() => onConfirm(reason.trim())}
          className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
        >
          {busy ? 'Rechazando…' : 'Rechazar solicitud'}
        </button>
      </div>
    </Modal>
  );
}
