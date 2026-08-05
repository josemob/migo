import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Card, ErrorNote, PageHeader, SectionTitle, Spinner } from '../components/ui';
import { Icon } from '../components/Icon';

interface Clinic {
  id: string;
  name: string;
  representative: string;
  rif: string;
  orgName: string;
  plan: string;
  createdAt: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
}
interface ClinicsResp {
  data: Clinic[];
  counts: { solicitudes: number; activos: number; suspendidos: number };
}

type Tab = 'PENDING' | 'ACTIVE' | 'SUSPENDED';
const TABS: { key: Tab; label: (c: ClinicsResp['counts']) => string; dot: string }[] = [
  { key: 'PENDING', label: (c) => `Solicitudes (${c.solicitudes})`, dot: 'bg-amber-400' },
  { key: 'ACTIVE', label: (c) => `Activos (${c.activos})`, dot: 'bg-green-500' },
  { key: 'SUSPENDED', label: (c) => `Suspendidos (${c.suspendidos})`, dot: 'bg-red-500' },
];

const statusBadge = (s: Tab) =>
  s === 'ACTIVE' ? <Badge tone="green">Activo</Badge> : s === 'SUSPENDED' ? <Badge tone="red">Suspendido</Badge> : <Badge tone="amber">Solicitud</Badge>;

const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });

export default function Comercios() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('PENDING');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({ queryKey: ['admin-clinics'], queryFn: () => api<ClinicsResp>('/admin/clinics') });

  const mutation = useMutation({
    mutationFn: (v: { id: string; action: string }) => api(`/admin/clinics/${v.id}/status`, { method: 'POST', body: { action: v.action } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-clinics'] }),
  });

  const rows = useMemo(() => (data?.data ?? []).filter((c) => c.status === tab), [data, tab]);
  const selected = data?.data.find((c) => c.id === selectedId) ?? rows[0] ?? null;

  return (
    <div>
      <PageHeader title="Gestión de Comercios" subtitle="Administre las clínicas afiliadas, revise solicitudes de ingreso y controle estados de cuenta." />

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : error ? (
        <ErrorNote error={error} />
      ) : data ? (
        <>
          <div className="mb-6 flex gap-3">
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
                          <td className="py-3 pr-4 font-semibold text-slate-800">{c.name}</td>
                          <td className="py-3 pr-4 text-slate-500">{c.representative}</td>
                          <td className="py-3 pr-4 text-slate-500">{c.rif}</td>
                          <td className="py-3 pr-4 text-slate-500">{fmtDate(c.createdAt)}</td>
                          <td className="py-3">{statusBadge(c.status)}</td>
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
                  <div className="mt-1 text-xs text-slate-400">RIF: {selected.rif} · Plan {selected.plan}</div>

                  <div className="mt-5 space-y-2 text-sm">
                    <div className="flex items-center justify-between"><span className="text-slate-500">Estado actual</span>{statusBadge(selected.status)}</div>
                    <div className="flex items-center justify-between"><span className="text-slate-500">Representante</span><span className="font-medium text-slate-700">{selected.representative}</span></div>
                    <div className="flex items-center justify-between"><span className="text-slate-500">Solicitud</span><span className="font-medium text-slate-700">{fmtDate(selected.createdAt)}</span></div>
                  </div>

                  <div className="mt-6 space-y-2">
                    {selected.status !== 'ACTIVE' && (
                      <button
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate({ id: selected.id, action: selected.status === 'SUSPENDED' ? 'reactivate' : 'approve' })}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-2.5 font-semibold text-white transition hover:bg-green-600 disabled:opacity-60"
                      >
                        <Icon name="check" className="h-5 w-5" />{selected.status === 'SUSPENDED' ? 'Reactivar Comercio' : 'Aprobar Comercio'}
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
                    {selected.status !== 'SUSPENDED' && (
                      <button
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate({ id: selected.id, action: 'reject' })}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 font-semibold text-white transition hover:bg-red-600 disabled:opacity-60"
                      >
                        <Icon name="close" className="h-5 w-5" />Rechazar (Con Motivo)
                      </button>
                    )}
                  </div>
                  {mutation.isError && <div className="mt-3"><ErrorNote error={mutation.error} /></div>}
                </div>
              )}
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
