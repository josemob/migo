import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth, isClinicAdmin } from '../lib/auth';
import { Card, ErrorNote, SectionTitle } from './ui';
import { Icon } from './Icon';

// ── Documentos: foto (comprimida aquí) o PDF, como data URI ────────────────

const MAX_PDF_BYTES = 650 * 1024;
const MAX_SIDE = 1800;

/** Convierte el archivo elegido en data URI. Las fotos se reducen a JPEG para no pesar. */
export async function fileToDataUri(file: File): Promise<string> {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) throw new Error('El PDF pesa más de 650 KB. Sube una foto del documento o un PDF más liviano.');
    return readAsDataUrl(file);
  }
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !file.type.startsWith('image/')) {
    throw new Error('Sube una foto (JPG o PNG) o un PDF.');
  }
  const src = await readAsDataUrl(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('No pudimos leer esa imagen. Prueba con otra foto.'));
    i.src = src;
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let quality = 0.82;
  let out = canvas.toDataURL('image/jpeg', quality);
  while (out.length > 850_000 && quality > 0.4) {
    quality -= 0.12;
    out = canvas.toDataURL('image/jpeg', quality);
  }
  return out;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('No pudimos leer el archivo.'));
    r.readAsDataURL(file);
  });
}

/** Casilla para subir un documento, con vista previa. */
export function DocPicker({
  label,
  hint,
  value,
  onChange,
  optional,
}: {
  label: string;
  hint: string;
  value: string | null;
  onChange: (v: string | null) => void;
  optional?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isPdf = value?.startsWith('data:application/pdf');

  const pick = async (file?: File) => {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      onChange(await fileToDataUri(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el archivo');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-semibold text-slate-600">{label}</span>
        {optional && <span className="text-[11px] text-slate-400">Opcional</span>}
      </div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={`flex w-full items-center gap-4 rounded-2xl border-2 border-dashed p-4 text-left transition ${
          value ? 'border-brand-300 bg-brand-50/60' : 'border-slate-200 hover:border-brand-300 hover:bg-brand-50/40'
        }`}
      >
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white text-brand-500 shadow-sm">
          {value && !isPdf ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon name={value ? 'check' : 'camera'} className="h-6 w-6" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-800">
            {busy ? 'Procesando…' : value ? (isPdf ? 'PDF cargado' : 'Foto cargada') : 'Subir foto o PDF'}
          </span>
          <span className="block text-xs text-slate-500">{value ? 'Toca para reemplazarlo' : hint}</span>
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ── Estado de verificación ─────────────────────────────────────────────────

export interface VerificationState {
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  rejectionReason: string | null;
  suspended: boolean;
  rif: string | null;
  hasRifDoc: boolean;
  hasSanitaryPermit: boolean;
}

export const VERIFICATION_KEY = ['clinic-verification'];

export function useVerification() {
  const { user } = useAuth();
  return useQuery({
    queryKey: VERIFICATION_KEY,
    queryFn: () => api<VerificationState>('/clinic/verification'),
    enabled: !!user?.staffProfile,
    staleTime: 60_000,
  });
}

/** Aviso fijo arriba del panel mientras la clínica no esté aprobada. */
export function VerificationBanner() {
  const { user } = useAuth();
  const { data } = useVerification();
  if (!data || data.status === 'VERIFIED') return null;
  const admin = isClinicAdmin(user);

  if (data.status === 'REJECTED') {
    return (
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
        <Icon name="emergency" className="h-6 w-6 shrink-0 text-red-500" />
        <div className="min-w-0 flex-1">
          <p className="font-heading font-bold text-red-800">No pudimos aprobar tu clínica</p>
          <p className="text-sm text-red-700">
            {data.rejectionReason ? <>Motivo: {data.rejectionReason}. </> : null}
            Corrige los datos y vuelve a enviarla a revisión.
          </p>
        </div>
        {admin && (
          <Link to="/configuracion#verificacion" className="rounded-pill bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700">
            Corregir y reenviar
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-lg">⏳</span>
      <div className="min-w-0 flex-1">
        <p className="font-heading font-bold text-amber-900">Tu clínica está en revisión</p>
        <p className="text-sm text-amber-800">
          Aún no aparece en la app Migo. Mientras la aprobamos, completa tus horarios, servicios y equipo para estar listos.
        </p>
      </div>
      {admin && (
        <Link to="/configuracion" className="rounded-pill bg-white px-5 py-2.5 text-sm font-bold text-amber-900 shadow-sm hover:bg-amber-100">
          Completar perfil
        </Link>
      )}
    </div>
  );
}

/** Sección de Configuración para corregir RIF/documentos y volver a pedir revisión. */
export function VerificationSection() {
  const qc = useQueryClient();
  const { data } = useVerification();
  const [rifDoc, setRifDoc] = useState<string | null>(null);
  const [permit, setPermit] = useState<string | null>(null);
  const { hash } = useLocation();
  const ready = !!data && data.status !== 'VERIFIED';
  // Llega desde el aviso 'Corregir y reenviar' (#verificacion): baja hasta aquí.
  useEffect(() => {
    if (ready && hash === '#verificacion') document.getElementById('verificacion')?.scrollIntoView({ behavior: 'smooth' });
  }, [ready, hash]);

  const send = useMutation({
    mutationFn: () =>
      api('/clinic/verification', {
        method: 'POST',
        body: {
          ...(rifDoc ? { rifDocUrl: rifDoc } : {}),
          ...(permit ? { sanitaryPermitUrl: permit } : {}),
        },
      }),
    onSuccess: () => {
      setRifDoc(null);
      setPermit(null);
      void qc.invalidateQueries({ queryKey: VERIFICATION_KEY });
    },
  });

  if (!data || data.status === 'VERIFIED') return null;
  const rejected = data.status === 'REJECTED';
  // Rechazada: puede reenviar aunque solo haya corregido los datos legales más abajo.
  const canSend = rejected || !!(rifDoc || permit);

  return (
    <div id="verificacion" className="scroll-mt-6">
      <Card>
        <SectionTitle>Verificación del establecimiento</SectionTitle>
        <p className="-mt-2 mb-5 text-sm text-slate-500">
          {rejected
            ? 'Tu solicitud fue rechazada. Corrige lo necesario (los datos legales y el RIF se editan más abajo) y envíala de nuevo a revisión.'
            : 'Tu solicitud está en revisión. Si necesitas reemplazar un documento, puedes hacerlo aquí; el RIF se edita en Datos legales.'}
        </p>
        {rejected && data.rejectionReason && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <b>Motivo:</b> {data.rejectionReason}
          </div>
        )}
        <div className="grid gap-5 md:grid-cols-2">
          <DocPicker
            label={data.hasRifDoc ? 'Reemplazar foto del RIF' : 'Foto o PDF del RIF'}
            hint="Que se lea el número y la razón social"
            value={rifDoc}
            onChange={setRifDoc}
          />
          <DocPicker
            label={data.hasSanitaryPermit ? 'Reemplazar permiso sanitario' : 'Permiso sanitario'}
            hint="Ayuda a aprobarte más rápido"
            value={permit}
            onChange={setPermit}
            optional
          />
        </div>
        {send.isError && <div className="mt-4"><ErrorNote error={send.error} /></div>}
        {send.isSuccess && <p className="mt-4 text-sm font-semibold text-green-700">Listo, la enviamos a revisión. Te avisaremos por correo.</p>}
        <button
          type="button"
          disabled={!canSend || send.isPending}
          onClick={() => send.mutate()}
          className="mt-5 inline-flex items-center gap-2 rounded-pill bg-brand-900 px-6 py-3 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-50"
        >
          <Icon name="send" className="h-4 w-4" />
          {send.isPending ? 'Enviando…' : 'Enviar a revisión'}
        </button>
      </Card>
    </div>
  );
}
