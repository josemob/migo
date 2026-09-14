import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { MigoLogo } from '../components/MigoLogo';
import { Icon } from '../components/Icon';

export default function Login() {
  const { login } = useAuth();
  // Campos vacíos: antes venían precargados con credenciales reales y además se
  // mostraban en pantalla, lo que las exponía en producción.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen gap-3 bg-warm-shell p-3">
      {/* ── Izquierda: formulario ──────────────────────────────────────── */}
      <div className="flex flex-1 flex-col rounded-shell bg-white px-8 py-7 shadow-soft sm:px-14">
        <header className="flex items-center justify-between">
          <MigoLogo height={30} />
          <span className="rounded-pill bg-brand-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-migo-purple">
            Panel de clínicas
          </span>
        </header>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <p className="text-xs font-medium tracking-wide text-slate-400">
            01 <span className="mx-1.5 text-slate-300">/</span> Acceso
          </p>

          <h1 className="mt-3 font-heading text-[46px] font-extrabold leading-[1.05] tracking-tight text-brand-900">
            Bienvenido de vuelta
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-500">
            Ingresa con tus credenciales para gestionar la agenda, las urgencias y los pacientes de
            tu sucursal.
          </p>

          <form onSubmit={submit} className="mt-10">
            {error && (
              <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}

            <Field
              label="Correo"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="tu@clinica.com"
              autoComplete="username"
            />
            <Field
              label="Contraseña"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              autoComplete="current-password"
            />

            <button
              type="submit"
              disabled={busy}
              className="mt-9 inline-flex items-center gap-2 rounded-pill bg-brand-900 px-7 py-3.5 font-heading text-sm font-bold text-white transition hover:bg-brand-800 disabled:opacity-60"
            >
              {busy ? 'Entrando…' : 'Iniciar sesión'}
              {!busy && <Icon name="chevronRight" className="h-4 w-4" />}
            </button>

            <p className="mt-5 flex items-center gap-2 text-xs text-slate-400">
              <Icon name="hospital" className="h-3.5 w-3.5 shrink-0" />
              Acceso exclusivo para el equipo de clínicas afiliadas a Migo.
            </p>
          </form>
        </div>
      </div>

      {/* ── Derecha: panel de marca ─────────────────────────────────────── */}
      <div className="relative hidden w-[46%] max-w-[720px] shrink-0 overflow-hidden rounded-shell bg-gradient-to-br from-brand-500 via-brand-700 to-brand-900 shadow-soft lg:block">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-accent-300/20 blur-3xl" />
        <MigoLogo
          variant="isotype"
          height={620}
          color="#FFFFFF"
          className="pointer-events-none absolute -right-28 top-1/2 -translate-y-1/2 opacity-[0.07]"
        />

        <div className="relative flex h-full flex-col justify-end p-12">
          <MigoLogo variant="mono" height={44} />
          <h2 className="mt-7 max-w-md font-heading text-[40px] font-extrabold leading-[1.1] tracking-tight text-white">
            Tu clínica, siempre lista
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
            Urgencias en tiempo real, agenda del día y el historial completo de cada paciente — en un
            solo panel.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Pill icon="emergency" label="Urgencias" />
            <Pill icon="calendar" label="Agenda" />
            <Pill icon="paw" label="Pacientes" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Input con línea inferior (estilo minimalista). */
function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
}) {
  return (
    <div className="mb-7">
      <label className="mb-2 block text-xs font-semibold text-slate-600">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className="w-full border-0 border-b border-slate-200 bg-transparent px-0 pb-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-brand-500 focus:ring-0"
      />
    </div>
  );
}

function Pill({ icon, label }: { icon: 'emergency' | 'calendar' | 'paw'; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-pill bg-white/10 px-4 py-2 text-xs font-semibold text-white/85 backdrop-blur-sm">
      <Icon name={icon} className="h-3.5 w-3.5 text-accent-300" />
      {label}
    </span>
  );
}
