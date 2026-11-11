import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, downloadFile } from '../lib/api';
import { ErrorNote, Spinner } from './ui';
import { Icon } from './Icon';

interface RecordDetail {
  id: string;
  visitedAt: string;
  reason?: string | null;
  symptoms?: string | null;
  diagnosis?: string | null;
  treatment?: string | null;
  notes?: string | null;
  weightKg?: string | number | null;
  temperature?: string | number | null;
  signedAt?: string | null;
  signedByName?: string | null;
  signedByLicense?: string | null;
  signedBySpecialty?: string | null;
  pet: { name: string; breed?: string | null; owner: { fullName: string; email: string; phone?: string | null } };
  prescriptions: { id: string; drug: string; dose?: string | null; frequency?: string | null; durationDays?: number | null; instructions?: string | null }[];
  clinic?: { name: string } | null;
  vet?: { user: { fullName: string } } | null;
}

const longDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-VE', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const num = (v: string | number) => Number(v).toLocaleString('es-VE', { maximumFractionDigits: 2 });

/** Panel lateral con el detalle de una consulta: descargar el informe en PDF y enviarlo por correo. */
export function RecordDrawer({ recordId, onClose }: { recordId: string | null; onClose: () => void }) {
  const open = !!recordId;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const { data: r, isLoading, error } = useQuery({
    queryKey: ['record-detail', recordId],
    queryFn: () => api<RecordDetail>(`/patients/records/${recordId}`),
    enabled: open,
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl sm:m-3 sm:h-[calc(100%-1.5rem)] sm:rounded-shell"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Detalle de la consulta"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-7 py-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Detalle de la consulta</p>
            <h2 className="mt-1 truncate font-heading text-2xl font-extrabold text-brand-900">
              {r ? r.reason || 'Consulta' : 'Cargando…'}
            </h2>
            {r && (
              <p className="mt-1 text-sm text-slate-500">
                {r.pet.name}{r.pet.breed ? ` · ${r.pet.breed}` : ''} · {longDateTime(r.visitedAt)}
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto px-7 py-6">
          {isLoading && <Spinner className="mx-auto my-10" />}
          {error && <ErrorNote error={error} />}
          {r && <RecordBody r={r} />}
        </div>

        {r && <Actions r={r} />}
      </aside>
    </div>
  );
}

function RecordBody({ r }: { r: RecordDetail }) {
  const vet = r.signedByName ?? r.vet?.user.fullName;
  return (
    <div>
      {r.signedAt ? (
        <div className="mb-6 flex items-center gap-3 rounded-2xl bg-green-50 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white">
            <Icon name="check" className="h-4 w-4" />
          </span>
          <div className="text-sm">
            <div className="font-semibold text-green-800">Firmado por {vet ?? 'el veterinario'}</div>
            <div className="text-green-700/80">
              {[r.signedBySpecialty, r.signedByLicense && `Colegiado N.º ${r.signedByLicense}`].filter(Boolean).join(' · ')}
              {r.signedBySpecialty || r.signedByLicense ? ' · ' : ''}
              {longDateTime(r.signedAt)}
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-6 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <b>Borrador sin firmar.</b> Puedes descargarlo (sale marcado como borrador), pero solo se envía una vez que el
          veterinario lo firme desde la app Migo Vet.
        </div>
      )}

      {(r.weightKg != null || r.temperature != null) && (
        <div className="mb-6 grid grid-cols-2 gap-3">
          {r.weightKg != null && <Vital label="Peso" value={`${num(r.weightKg)} kg`} />}
          {r.temperature != null && <Vital label="Temperatura" value={`${num(r.temperature)} °C`} />}
        </div>
      )}

      <Field label="Motivo" value={r.reason} />
      <Field label="Síntomas" value={r.symptoms} />
      <Field label="Diagnóstico" value={r.diagnosis} />
      <Field label="Tratamiento" value={r.treatment} />
      <Field label="Notas" value={r.notes} />

      {r.prescriptions.length > 0 && (
        <div className="mb-5">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-migo-purple">Récipe</h4>
          <div className="space-y-2">
            {r.prescriptions.map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-200 border-l-4 border-l-migo-purple px-4 py-3">
                <div className="font-semibold text-slate-800">{p.drug}</div>
                <div className="text-sm text-slate-500">
                  {[p.dose && `Dosis: ${p.dose}`, p.frequency && `Frecuencia: ${p.frequency}`, p.durationDays && `Duración: ${p.durationDays} días`]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {p.instructions && <div className="mt-1 text-sm text-slate-500">{p.instructions}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
        Tutor: <b className="text-slate-700">{r.pet.owner.fullName}</b>
        {r.pet.owner.phone ? ` · ${r.pet.owner.phone}` : ''}
      </div>
    </div>
  );
}

function Actions({ r }: { r: RecordDetail }) {
  const [sending, setSending] = useState(false);
  const [to, setTo] = useState(r.pet.owner.email);
  const [message, setMessage] = useState('');

  const download = useMutation({ mutationFn: () => downloadFile(`/patients/records/${r.id}/pdf`, 'Informe.pdf') });
  const send = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; to: string }>(`/patients/records/${r.id}/send`, {
        method: 'POST',
        body: { to: to.trim(), ...(message.trim() ? { message: message.trim() } : {}) },
      }),
  });

  const signed = !!r.signedAt;
  const toOwner = to.trim().toLowerCase() === r.pet.owner.email.toLowerCase();

  return (
    <footer className="border-t border-slate-100 bg-slate-50/60 px-7 py-5">
      {sending && signed && !send.isSuccess && (
        <div className="mb-4 space-y-3">
          <label className="block">
            <span className="mb-1 flex items-baseline justify-between text-xs font-semibold text-slate-600">
              Enviar a
              {!toOwner && (
                <button type="button" onClick={() => setTo(r.pet.owner.email)} className="font-semibold text-migo-purple hover:underline">
                  Usar el correo del tutor
                </button>
              )}
            </span>
            <input type="email" value={to} onChange={(e) => setTo(e.target.value)} className="input w-full" placeholder="correo@ejemplo.com" />
            <span className="mt-1 block text-[11px] text-slate-400">
              {toOwner ? `Es el correo de ${r.pet.owner.fullName}.` : 'Por ejemplo, otro veterinario o un laboratorio.'}
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Mensaje (opcional)</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={500} className="input w-full" />
          </label>
        </div>
      )}

      {send.isSuccess && (
        <div className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
          ✓ Informe enviado a {send.data?.to}.
        </div>
      )}
      {(send.isError || download.isError) && (
        <div className="mb-4"><ErrorNote error={send.error ?? download.error} /></div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => download.mutate()}
          disabled={download.isPending}
          className="inline-flex items-center gap-2 rounded-pill border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-brand-900 hover:bg-slate-50 disabled:opacity-60"
        >
          <Icon name="save" className="h-4 w-4" />
          {download.isPending ? 'Generando…' : signed ? 'Descargar PDF' : 'Descargar borrador'}
        </button>

        {!sending || send.isSuccess ? (
          <button
            type="button"
            disabled={!signed}
            onClick={() => { send.reset(); setSending(true); }}
            title={signed ? undefined : 'Solo se envían expedientes firmados'}
            className="inline-flex items-center gap-2 rounded-pill bg-brand-900 px-5 py-3 text-sm font-bold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="send" className="h-4 w-4" /> {send.isSuccess ? 'Enviar a otro correo' : 'Enviar por correo'}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => send.mutate()}
              disabled={send.isPending || !/^\S+@\S+\.\S+$/.test(to.trim())}
              className="inline-flex items-center gap-2 rounded-pill bg-brand-900 px-5 py-3 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-50"
            >
              <Icon name="send" className="h-4 w-4" /> {send.isPending ? 'Enviando…' : 'Enviar informe'}
            </button>
            <button type="button" onClick={() => setSending(false)} className="px-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
              Cancelar
            </button>
          </>
        )}
      </div>
    </footer>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div className="mb-5">
      <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-migo-purple">{label}</h4>
      <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-700">{value}</p>
    </div>
  );
}

function Vital({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-brand-50/60 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="font-heading text-xl font-extrabold text-brand-900">{value}</div>
    </div>
  );
}
