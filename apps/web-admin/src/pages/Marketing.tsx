import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Card, ErrorNote, PageHeader, SectionTitle, Spinner } from '../components/ui';
import { Icon } from '../components/Icon';

interface Sponsorship { id: string; plan: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'; startsAt: string; expiresAt: string }
interface Clinic { id: string; name: string; status: 'PENDING' | 'ACTIVE' | 'SUSPENDED'; plan: string; sponsorship?: Sponsorship | null }
interface ClinicsResp { data: Clinic[] }

const PLAN_LABEL: Record<string, string> = { WEEKLY: 'Semanal', BIWEEKLY: 'Quincenal', MONTHLY: 'Mensual' };
const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });

export default function Marketing() {
  const clinics = useQuery({ queryKey: ['admin-clinics'], queryFn: () => api<ClinicsResp>('/admin/clinics') });
  const active = useMemo(() => (clinics.data?.data ?? []).filter((c) => c.status === 'ACTIVE'), [clinics.data]);

  return (
    <div>
      <PageHeader title="Marketing & Difusión" subtitle="Contenido patrocinado y envío de notificaciones push a los usuarios de la app." />

      {clinics.isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : clinics.error ? (
        <ErrorNote error={clinics.error} />
      ) : (
        <div className="space-y-6">
          <SponsorshipSection clinics={clinics.data!.data} active={active} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <GeneralPushCard />
            <CommercePushCard active={active} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 1) Contenido patrocinado ───────────────────────────────── */
function SponsorshipSection({ clinics, active }: { clinics: Clinic[]; active: Clinic[] }) {
  const qc = useQueryClient();
  const [clinicId, setClinicId] = useState('');
  const [plan, setPlan] = useState<'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>('MONTHLY');
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-clinics'] });

  const activate = useMutation({
    mutationFn: (v: { id: string; plan: string }) => api(`/admin/clinics/${v.id}/sponsorship`, { method: 'POST', body: { plan: v.plan } }),
    onSuccess: () => { invalidate(); setClinicId(''); },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/admin/clinics/${id}/sponsorship/cancel`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  const sponsored = clinics.filter((c) => c.sponsorship);

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <Icon name="bolt" className="h-5 w-5 text-amber-500" />
        <SectionTitle>Contenido patrocinado</SectionTitle>
      </div>
      <p className="mb-4 text-sm text-slate-500">Las clínicas patrocinadas aparecen primero en la búsqueda para usuarios a menos de 10 km, con la etiqueta “Patrocinado”.</p>

      <div className="flex flex-wrap items-end gap-2">
        <select value={clinicId} onChange={(e) => setClinicId(e.target.value)} className="min-w-[220px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm">
          <option value="">Selecciona un comercio…</option>
          {active.filter((c) => !c.sponsorship).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={plan} onChange={(e) => setPlan(e.target.value as typeof plan)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
          <option value="WEEKLY">Semanal (7 días)</option>
          <option value="BIWEEKLY">Quincenal (15 días)</option>
          <option value="MONTHLY">Mensual (30 días)</option>
        </select>
        <button
          disabled={!clinicId || activate.isPending}
          onClick={() => activate.mutate({ id: clinicId, plan })}
          className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
        >
          Activar patrocinio
        </button>
      </div>
      {activate.isError && <div className="mt-3"><ErrorNote error={activate.error} /></div>}

      <div className="mt-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Patrocinios vigentes ({sponsored.length})</div>
        {sponsored.length === 0 ? (
          <p className="text-sm text-slate-400">No hay comercios patrocinados ahora mismo.</p>
        ) : (
          <div className="space-y-2">
            {sponsored.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2">
                <span className="truncate text-sm font-semibold text-slate-800">{c.name}</span>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone="amber">{PLAN_LABEL[c.sponsorship!.plan]}</Badge>
                  <span className="text-xs text-slate-500">hasta {fmtDate(c.sponsorship!.expiresAt)}</span>
                  <button onClick={() => cancel.mutate(c.id)} disabled={cancel.isPending} className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50">
                    Cancelar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ── 2) Push general ────────────────────────────────────────── */
function GeneralPushCard() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'owners' | 'staff' | 'all'>('owners');

  const send = useMutation({
    mutationFn: () => api<{ devices: number; sent: number }>('/admin/marketing/push/general', { method: 'POST', body: { title, body, audience } }),
  });

  const disabled = !title.trim() || !body.trim() || send.isPending;

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <Icon name="send" className="h-5 w-5 text-migo-purple" />
        <SectionTitle>Notificación general</SectionTitle>
      </div>
      <p className="mb-4 text-sm text-slate-500">Envía un push a todos los usuarios de la app. Úsalo para anuncios y campañas.</p>

      <label className="mb-1 block text-xs font-semibold text-slate-500">Título</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="¡Novedades en Migo!" className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500" />
      <label className="mb-1 block text-xs font-semibold text-slate-500">Mensaje</label>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={300} rows={3} placeholder="Escribe el mensaje que verán los usuarios…" className="mb-3 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500" />
      <label className="mb-1 block text-xs font-semibold text-slate-500">Público</label>
      <select value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)} className="mb-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
        <option value="owners">Dueños de mascotas</option>
        <option value="staff">Personal de clínicas</option>
        <option value="all">Todos</option>
      </select>

      <button
        disabled={disabled}
        onClick={() => { if (confirm('¿Enviar esta notificación a todos los usuarios seleccionados?')) send.mutate(); }}
        className="w-full rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
      >
        {send.isPending ? 'Enviando…' : 'Enviar notificación'}
      </button>
      {send.isError && <div className="mt-3"><ErrorNote error={send.error} /></div>}
      {send.isSuccess && <div className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700">✅ Enviado a {send.data.sent} de {send.data.devices} dispositivos.</div>}
    </Card>
  );
}

/* ── 3) Push a comercios (por radio) ────────────────────────── */
function CommercePushCard({ active }: { active: Clinic[] }) {
  const [clinicId, setClinicId] = useState('');
  const [radiusKm, setRadiusKm] = useState('10');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const reach = useQuery({
    queryKey: ['marketing-reach', clinicId, radiusKm],
    queryFn: () => api<{ users: number; devices: number }>(`/admin/marketing/reach?clinicId=${clinicId}&radiusKm=${radiusKm}`),
    enabled: !!clinicId && Number(radiusKm) > 0,
  });

  const send = useMutation({
    mutationFn: () => api<{ reached: number; devices: number; sent: number }>('/admin/marketing/push/commerce', {
      method: 'POST', body: { clinicId, radiusKm: Number(radiusKm), title, body },
    }),
  });

  const disabled = !clinicId || !title.trim() || !body.trim() || Number(radiusKm) <= 0 || send.isPending;

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <Icon name="pin" className="h-5 w-5 text-migo-purple" />
        <SectionTitle>Push a comercio (por cercanía)</SectionTitle>
      </div>
      <p className="mb-4 text-sm text-slate-500">Envía un push a los usuarios cuya última ubicación está dentro del radio de un comercio.</p>

      <label className="mb-1 block text-xs font-semibold text-slate-500">Comercio</label>
      <select value={clinicId} onChange={(e) => setClinicId(e.target.value)} className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
        <option value="">Selecciona un comercio…</option>
        {active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      <label className="mb-1 block text-xs font-semibold text-slate-500">Radio (km)</label>
      <input type="number" min={1} max={500} value={radiusKm} onChange={(e) => setRadiusKm(e.target.value)} className="mb-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500" />
      {clinicId && Number(radiusKm) > 0 && (
        <div className="mb-3 text-xs text-slate-500">
          {reach.isFetching ? 'Estimando alcance…' : reach.data ? `Alcance estimado: ${reach.data.users} usuarios · ${reach.data.devices} dispositivos` : reach.error ? 'No se pudo estimar (¿el comercio tiene ubicación?).' : ''}
        </div>
      )}

      <label className="mb-1 block text-xs font-semibold text-slate-500">Título</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Promo cerca de ti" className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500" />
      <label className="mb-1 block text-xs font-semibold text-slate-500">Mensaje</label>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={300} rows={3} placeholder="Escribe el mensaje…" className="mb-4 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500" />

      <button
        disabled={disabled}
        onClick={() => { if (confirm(`¿Enviar el push a los usuarios dentro de ${radiusKm} km del comercio?`)) send.mutate(); }}
        className="w-full rounded-xl bg-migo-purple py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {send.isPending ? 'Enviando…' : 'Enviar push segmentado'}
      </button>
      {send.isError && <div className="mt-3"><ErrorNote error={send.error} /></div>}
      {send.isSuccess && <div className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700">✅ Enviado a {send.data.reached} usuarios ({send.data.sent} dispositivos).</div>}
    </Card>
  );
}
