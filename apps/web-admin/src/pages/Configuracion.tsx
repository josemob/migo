import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Card, ErrorNote, PageHeader, SectionTitle, Spinner } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';

function TitleIcon({ name, children }: { name: IconName; children: string }) {
  return <span className="flex items-center gap-2"><Icon name={name} className="h-5 w-5 text-migo-purple" />{children}</span>;
}

interface Config { cplFeeUsd: number; commissionRate: number; bcvRate: number; paymentGateway: string }
interface Admin { id: string; fullName: string; email: string; status: string; lastAccess: string }
interface ConfigResp { config: Config; admins: Admin[] }

const fmtDate = (d: string) => new Date(d).toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Configuracion() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-config'], queryFn: () => api<ConfigResp>('/admin/config') });

  const [cpl, setCpl] = useState(5);
  const [rate, setRate] = useState(0.08);
  useEffect(() => {
    if (data) { setCpl(data.config.cplFeeUsd); setRate(data.config.commissionRate); }
  }, [data]);

  const save = useMutation({
    mutationFn: () => api('/admin/config', { method: 'PATCH', body: { cplFeeUsd: cpl, commissionRate: rate } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-config'] }),
  });

  return (
    <div>
      <PageHeader title="Configuración Global del Sistema" subtitle="Administre los ajustes de monetización, integraciones financieras y accesos del personal Migo Super Admin." />

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : error ? (
        <ErrorNote error={error} />
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <SectionTitle><TitleIcon name="finance">Ajustes de Monetización</TitleIcon></SectionTitle>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Valor del Lead de Emergencia (CPL)</label>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-slate-500">$</span>
                <input type="number" step="0.5" value={cpl} onChange={(e) => setCpl(Number(e.target.value))} className="w-32 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                <span className="text-sm text-slate-400">USD</span>
              </div>

              <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Comisión estándar por rutina — <span className="font-bold text-migo-purple">{(rate * 100).toFixed(0)}%</span></label>
              <input type="range" min={0} max={0.3} step={0.01} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="mt-2 w-full accent-migo-purple" />

              <button onClick={() => save.mutate()} disabled={save.isPending} className="mt-5 w-full rounded-xl bg-brand-500 py-2.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
                {save.isPending ? 'Guardando…' : 'Guardar Cambios de Tarifas'}
              </button>
              {save.isSuccess && <p className="mt-2 text-center text-xs text-green-600">Tarifas actualizadas.</p>}
            </Card>

            <Card>
              <SectionTitle><TitleIcon name="bank">Integración Financiera & Pasarela</TitleIcon></SectionTitle>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tasa oficial BCV actual</label>
              <div className="mt-1 rounded-xl border border-green-200 bg-green-50 px-4 py-3 font-bold text-green-700">Bs. {data.config.bcvRate.toFixed(2)} / USD</div>

              <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Pasarela de pagos activa</label>
              <div className="mt-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700">{data.config.paymentGateway}</div>
            </Card>
          </div>

          <Card className="mt-6">
            <SectionTitle><TitleIcon name="team">Gestión de Administradores MIGO</TitleIcon></SectionTitle>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-3 pr-4 font-semibold">Nombre / Email</th>
                  <th className="py-3 pr-4 font-semibold">Rol</th>
                  <th className="py-3 pr-4 font-semibold">Último Acceso</th>
                  <th className="py-3 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.admins.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50">
                    <td className="py-3 pr-4"><div className="font-semibold text-slate-800">{a.fullName}</div><div className="text-xs text-slate-400">{a.email}</div></td>
                    <td className="py-3 pr-4 font-medium text-migo-purple">Super Admin</td>
                    <td className="py-3 pr-4 text-slate-500">{fmtDate(a.lastAccess)}</td>
                    <td className="py-3">{a.status === 'ACTIVE' ? <Badge tone="green">Activo</Badge> : <Badge tone="slate">Inactivo</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      ) : null}
    </div>
  );
}
