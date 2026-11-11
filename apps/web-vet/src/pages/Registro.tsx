import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { MigoLogo } from '../components/MigoLogo';
import { Icon } from '../components/Icon';
import { LocationPicker } from '../components/LocationPicker';
import { DocPicker } from '../components/Verification';

const STEPS = ['Tus datos', 'Empresa', 'Sede'] as const;
const RIF_RE = /^[JGVEPC]-?\d{8}-?\d$/i;
const cleanRif = (v: string) => v.toUpperCase().replace(/[\s.]/g, '');

// Nombres legibles de los campos para los errores que devuelve el servidor.
const FIELD_LABEL: Record<string, string> = {
  fullName: 'Nombre', email: 'Correo', password: 'Contraseña', phone: 'Teléfono', orgName: 'Nombre comercial',
  rif: 'RIF', rifDocUrl: 'Documento del RIF', sanitaryPermitUrl: 'Permiso sanitario', clinicName: 'Nombre de la sede',
  address: 'Dirección', city: 'Ciudad', latitude: 'Ubicación', longitude: 'Ubicación',
};

function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.details && typeof err.details === 'object') {
    const [field, msgs] = Object.entries(err.details as Record<string, string[]>)[0] ?? [];
    if (field && msgs?.[0]) return `${FIELD_LABEL[field] ?? field}: ${msgs[0]}`;
  }
  return err instanceof Error ? err.message : 'No se pudo completar el registro';
}

export default function Registro() {
  const { registerClinic } = useAuth();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Paso 1 — responsable
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  // Paso 2 — empresa
  const [orgName, setOrgName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [rif, setRif] = useState('');
  const [rifDoc, setRifDoc] = useState<string | null>(null);
  const [permit, setPermit] = useState<string | null>(null);
  // Paso 3 — sede
  const [clinicName, setClinicName] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [is24, setIs24] = useState(false);
  const [emergencies, setEmergencies] = useState(true);

  /** Valida el paso actual; devuelve el primer problema o '' si está bien. */
  const check = (s: number): string => {
    if (s === 0) {
      if (fullName.trim().length < 3) return 'Escribe tu nombre completo.';
      if (phone.replace(/\D/g, '').length < 7) return 'Escribe un teléfono de contacto.';
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Escribe un correo válido.';
      if (password.length < 8) return 'La contraseña debe tener mínimo 8 caracteres.';
      if (password !== password2) return 'Las contraseñas no coinciden.';
    }
    if (s === 1) {
      if (orgName.trim().length < 2) return 'Escribe el nombre comercial.';
      if (!RIF_RE.test(cleanRif(rif))) return 'El RIF debe tener el formato J-12345678-9.';
      if (!rifDoc) return 'Sube la foto o el PDF del RIF.';
    }
    if (s === 2) {
      if (clinicName.trim().length < 2) return 'Escribe el nombre de la sede.';
      if (lat == null || lng == null) return 'Marca la ubicación de la sede en el mapa.';
      if (address.trim().length < 5) return 'Escribe la dirección de la sede.';
      if (city.trim().length < 2) return 'Escribe la ciudad.';
    }
    return '';
  };

  const next = () => {
    const problem = check(step);
    if (problem) return setError(problem);
    setError('');
    // La sede arranca con el nombre comercial (lo normal cuando hay una sola).
    if (step === 1 && !clinicName.trim()) setClinicName(orgName.trim());
    setStep((v) => v + 1);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < STEPS.length - 1) return next();
    const problem = check(2);
    if (problem) return setError(problem);
    setError('');
    setBusy(true);
    try {
      await registerClinic({
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        password,
        orgName: orgName.trim(),
        legalName: legalName.trim() || undefined,
        rif: cleanRif(rif),
        rifDocUrl: rifDoc,
        sanitaryPermitUrl: permit ?? undefined,
        clinicName: clinicName.trim(),
        clinicPhone: clinicPhone.trim() || undefined,
        address: address.trim(),
        city: city.trim(),
        state: stateName.trim() || undefined,
        latitude: lat,
        longitude: lng,
        isOpen24_7: is24,
        acceptsEmergencies: emergencies,
      });
      // Con la sesión iniciada, App muestra el panel (con el aviso "en revisión").
    } catch (err) {
      setError(errorMessage(err));
      // Si el correo ya existe, vuelve al paso donde se corrige.
      if (err instanceof ApiError && err.status === 409) setStep(/correo/i.test(err.message) ? 0 : 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen gap-3 bg-warm-shell p-3 lg:h-screen">
      {/* ── Izquierda: formulario ──────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-y-auto rounded-shell bg-white px-6 py-7 shadow-soft sm:px-14">
        <header className="flex items-center justify-between">
          <MigoLogo height={30} />
          <Link to="/login" className="text-sm font-semibold text-migo-purple hover:underline">
            Ya tengo cuenta
          </Link>
        </header>

        <div className="mx-auto w-full max-w-xl flex-1 py-10">
          <Stepper step={step} />

          <h1 className="mt-6 font-heading text-[34px] font-extrabold leading-[1.08] tracking-tight text-brand-900 sm:text-[42px]">
            {step === 0 && 'Registra tu clínica'}
            {step === 1 && 'Datos de la empresa'}
            {step === 2 && '¿Dónde te encuentran?'}
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500">
            {step === 0 && 'Empecemos por ti. Serás el administrador del panel y podrás invitar a tu equipo después.'}
            {step === 1 && 'Usamos el RIF para verificar que el comercio es real antes de mostrarlo a los dueños de mascotas.'}
            {step === 2 && 'Marca la sede en el mapa: así te encuentran los dueños cercanos y te llegan las urgencias.'}
          </p>

          <form onSubmit={submit} className="mt-9" noValidate>
            {step === 0 && (
              <>
                <Field label="Nombre y apellido" value={fullName} onChange={setFullName} placeholder="María Pérez" autoComplete="name" />
                <Field label="Teléfono" type="tel" value={phone} onChange={setPhone} placeholder="0414-1234567" autoComplete="tel" />
                <Field label="Correo" type="email" value={email} onChange={setEmail} placeholder="tu@clinica.com" autoComplete="email" />
                <div className="grid gap-x-6 sm:grid-cols-2">
                  <Field label="Contraseña" type="password" value={password} onChange={setPassword} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
                  <Field label="Repite la contraseña" type="password" value={password2} onChange={setPassword2} placeholder="••••••••" autoComplete="new-password" />
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <Field label="Nombre comercial" value={orgName} onChange={setOrgName} placeholder="Clínica Veterinaria Los Robles" />
                <div className="grid gap-x-6 sm:grid-cols-2">
                  <Field label="Razón social" value={legalName} onChange={setLegalName} placeholder="Opcional" optional />
                  <Field
                    label="RIF"
                    value={rif}
                    onChange={setRif}
                    placeholder="J-12345678-9"
                    invalid={!!rif && !RIF_RE.test(cleanRif(rif))}
                  />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <DocPicker label="Foto o PDF del RIF" hint="Que se lea el número y la razón social" value={rifDoc} onChange={setRifDoc} />
                  <DocPicker label="Permiso sanitario" hint="Ayuda a aprobarte más rápido" value={permit} onChange={setPermit} optional />
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <Field label="Nombre de la sede" value={clinicName} onChange={setClinicName} placeholder="Sede Las Mercedes" />
                <div className="mb-7">
                  <span className="mb-2 block text-xs font-semibold text-slate-600">Ubicación</span>
                  <LocationPicker
                    lat={lat}
                    lng={lng}
                    onPick={(loc) => {
                      setLat(Number(loc.lat.toFixed(6)));
                      setLng(Number(loc.lng.toFixed(6)));
                      if (loc.address) setAddress(loc.address);
                      if (loc.city) setCity(loc.city);
                      if (loc.state) setStateName(loc.state);
                    }}
                  />
                </div>
                <Field label="Dirección" value={address} onChange={setAddress} placeholder="Av. Principal, edificio, local" />
                <div className="grid gap-x-6 sm:grid-cols-3">
                  <Field label="Ciudad" value={city} onChange={setCity} placeholder="Caracas" />
                  <Field label="Estado" value={stateName} onChange={setStateName} placeholder="Miranda" optional />
                  <Field label="Teléfono de la sede" type="tel" value={clinicPhone} onChange={setClinicPhone} placeholder="Si es otro" optional />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Toggle label="Abierta 24/7" hint="Atiende a toda hora" value={is24} onChange={setIs24} />
                  <Toggle label="Acepta urgencias" hint="Recibe alertas de emergencia" value={emergencies} onChange={setEmergencies} />
                </div>
              </>
            )}

            {error && (
              <div className="mt-7 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
            )}

            <div className="mt-9 flex items-center gap-4">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => { setError(''); setStep((v) => v - 1); }}
                  className="inline-flex items-center gap-1.5 rounded-pill px-4 py-3.5 text-sm font-bold text-slate-500 hover:text-brand-900"
                >
                  <Icon name="chevronLeft" className="h-4 w-4" /> Atrás
                </button>
              )}
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-pill bg-brand-900 px-7 py-3.5 font-heading text-sm font-bold text-white transition hover:bg-brand-800 disabled:opacity-60"
              >
                {busy ? 'Enviando…' : step < STEPS.length - 1 ? 'Continuar' : 'Enviar solicitud'}
                {!busy && <Icon name="chevronRight" className="h-4 w-4" />}
              </button>
            </div>

            {step === STEPS.length - 1 && (
              <p className="mt-5 text-xs leading-relaxed text-slate-400">
                Revisaremos tu solicitud y te avisaremos por correo. Mientras tanto podrás entrar al panel para preparar tu clínica;
                aparecerá en la app Migo cuando la aprobemos.
              </p>
            )}
          </form>
        </div>
      </div>

      {/* ── Derecha: panel de marca ─────────────────────────────────────── */}
      <div className="relative hidden w-[42%] max-w-[640px] shrink-0 overflow-hidden rounded-shell bg-gradient-to-br from-brand-500 via-brand-700 to-brand-900 shadow-soft lg:block">
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
          <h2 className="mt-7 max-w-md font-heading text-[38px] font-extrabold leading-[1.1] tracking-tight text-white">
            Suma tu clínica a Migo
          </h2>
          <ul className="mt-6 max-w-sm space-y-3 text-sm leading-relaxed text-white/80">
            <Benefit>Los dueños cercanos te encuentran y piden cita desde la app.</Benefit>
            <Benefit>Recibe urgencias de tu zona en tiempo real.</Benefit>
            <Benefit>Agenda, pacientes, equipo y cobros en un solo panel.</Benefit>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2 text-xs font-semibold">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
              i < step ? 'bg-migo-green text-white' : i === step ? 'bg-brand-900 text-white' : 'bg-slate-100 text-slate-400'
            }`}
          >
            {i < step ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <span className={i === step ? 'text-brand-900' : 'hidden text-slate-400 sm:inline'}>{label}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-slate-200" />}
        </li>
      ))}
    </ol>
  );
}

function Field({
  label, value, onChange, placeholder, type = 'text', autoComplete, optional, invalid,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
  type?: string; autoComplete?: string; optional?: boolean; invalid?: boolean;
}) {
  return (
    <label className="mb-7 block">
      <span className="mb-2 flex items-baseline justify-between text-xs font-semibold text-slate-600">
        {label}
        {optional && <span className="text-[11px] font-normal text-slate-400">Opcional</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`w-full border-0 border-b bg-transparent px-0 pb-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-300 focus:ring-0 ${
          invalid ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-brand-500'
        }`}
      />
    </label>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
        value ? 'border-brand-300 bg-brand-50/60' : 'border-slate-200 hover:bg-slate-50'
      }`}
    >
      <span>
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${value ? 'bg-brand-500' : 'bg-slate-200'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

function Benefit({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-300/25 text-accent-300">
        <Icon name="check" className="h-3 w-3" />
      </span>
      {children}
    </li>
  );
}
