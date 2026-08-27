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
interface Banner { enabled: boolean; image: string | null }
interface ConfigResp { config: Config; banner: Banner; admins: Admin[] }

const fmtDate = (d: string) => new Date(d).toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Configuracion() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-config'], queryFn: () => api<ConfigResp>('/admin/config') });

  const [cpl, setCpl] = useState(5);
  const [rate, setRate] = useState(0.08);
  const [bannerOn, setBannerOn] = useState(false);
  const [bannerImg, setBannerImg] = useState<string | null>(null);
  useEffect(() => {
    if (data) {
      setCpl(data.config.cplFeeUsd);
      setRate(data.config.commissionRate);
      setBannerOn(data.banner.enabled);
      setBannerImg(data.banner.image);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => api('/admin/config', { method: 'PATCH', body: { cplFeeUsd: cpl, commissionRate: rate } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-config'] }),
  });

  const saveBanner = useMutation({
    mutationFn: () => api('/admin/config/banner', { method: 'PATCH', body: { enabled: bannerOn, image: bannerImg } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-config'] }),
  });

  // Lee el archivo elegido como data URI (base64) para guardarlo en el banner.
  const onPickBanner = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1_500_000) { alert('La imagen es muy pesada (máx. ~1.5 MB). Usa un arte 300x100 optimizado.'); return; }
    const reader = new FileReader();
    reader.onload = () => setBannerImg(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  };

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
            <SectionTitle><TitleIcon name="image">Banner del Dashboard (App Cliente)</TitleIcon></SectionTitle>
            <p className="mb-4 text-sm text-slate-500">Pieza patrocinada 300×100 que se muestra en el inicio de la app del cliente. Enciende o apaga el espacio y sube el arte. (A futuro se controlará con Google AdSense.)</p>

            <label className="flex cursor-pointer items-center gap-3">
              <input type="checkbox" checked={bannerOn} onChange={(e) => setBannerOn(e.target.checked)} className="h-5 w-5 accent-migo-purple" />
              <span className="text-sm font-semibold text-slate-700">Mostrar el banner en la app</span>
            </label>

            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
              <div>
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Vista previa (300×100)</span>
                <div className="flex h-[100px] w-[300px] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {bannerImg ? (
                    <img src={bannerImg} alt="Banner" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-slate-400">Sin arte cargado</span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Subir arte…
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => onPickBanner(e.target.files?.[0])} />
                </label>
                {bannerImg && (
                  <button onClick={() => setBannerImg(null)} className="text-xs font-medium text-red-500 hover:underline">Quitar arte</button>
                )}
              </div>
            </div>

            <button onClick={() => saveBanner.mutate()} disabled={saveBanner.isPending} className="mt-5 rounded-xl bg-brand-500 px-6 py-2.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
              {saveBanner.isPending ? 'Guardando…' : 'Guardar banner'}
            </button>
            {saveBanner.isSuccess && <p className="mt-2 text-xs text-green-600">Banner actualizado.</p>}
            {saveBanner.isError && <p className="mt-2 text-xs text-red-600">No se pudo guardar. Revisa el tamaño del arte.</p>}
          </Card>

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
