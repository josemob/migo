import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, PageHeader, SectionTitle, Spinner, ErrorNote } from '../components/ui';
import { Icon } from '../components/Icon';

interface Hour {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isOpen: boolean;
  isOnCall: boolean;
}
interface Organization {
  name?: string;
  legalName?: string;
  rif?: string;
  email?: string;
  phone?: string;
  verificationStatus?: string;
}
interface Clinic {
  name: string;
  description?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  latitude?: string;
  longitude?: string;
  isOpen24_7: boolean;
  acceptsEmergencies: boolean;
  organization?: Organization;
  hours: Hour[];
}

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
// RIF venezolano: letra fiscal (J/G/V/E/P) + dígitos, ej. J-40123456-7
const RIF_RE = /^[VEJPGvejpg]-?\d{7,9}-?\d?$/;

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-left"
    >
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span className={`relative h-6 w-11 rounded-full transition ${on ? 'bg-migo-green' : 'bg-slate-300'}`}>
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}

export default function Configuracion() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['clinic'], queryFn: () => api<Clinic>('/clinic') });

  // Datos legales del comercio
  const [legalName, setLegalName] = useState('');
  const [rif, setRif] = useState('');
  const [orgEmail, setOrgEmail] = useState('');
  const [orgPhone, setOrgPhone] = useState('');
  // Perfil de sucursal
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  // Ubicación
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  // Operación
  const [open247, setOpen247] = useState(false);
  const [acceptsEmergencies, setAcceptsEmergencies] = useState(true);
  // Horarios
  const [hours, setHours] = useState<Hour[]>([]);

  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setLegalName(data.organization?.legalName ?? '');
    setRif(data.organization?.rif ?? '');
    setOrgEmail(data.organization?.email ?? '');
    setOrgPhone(data.organization?.phone ?? '');
    setName(data.name ?? '');
    setDescription(data.description ?? '');
    setPhone(data.phone ?? '');
    setEmail(data.email ?? '');
    setAddress(data.address ?? '');
    setCity(data.city ?? '');
    setStateName(data.state ?? '');
    setLat(data.latitude != null ? String(data.latitude) : '');
    setLng(data.longitude != null ? String(data.longitude) : '');
    setOpen247(data.isOpen24_7);
    setAcceptsEmergencies(data.acceptsEmergencies);
    setHours(
      ORDER.map(
        (d) =>
          data.hours.find((h) => h.dayOfWeek === d) ?? {
            dayOfWeek: d,
            opensAt: '08:00',
            closesAt: '18:00',
            isOpen: false,
            isOnCall: false,
          },
      ),
    );
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      // Validaciones de registro del comercio
      if (name.trim().length < 2) throw new Error('El nombre de la sucursal es obligatorio.');
      if (legalName.trim().length < 2) throw new Error('La razón social del comercio es obligatoria.');
      if (!RIF_RE.test(rif.trim())) throw new Error('El RIF del comercio es obligatorio y debe tener el formato J-40123456-7.');

      // 1) Datos legales del comercio (razón social + RIF)
      await api('/clinic/organization', {
        method: 'PATCH',
        body: { legalName: legalName.trim(), rif: rif.trim(), email: orgEmail.trim(), phone: orgPhone.trim() },
      });

      // 2) Perfil + ubicación + operación de la sucursal
      const clinicBody: Record<string, unknown> = {
        name: name.trim(),
        description,
        address,
        city,
        state: stateName,
        isOpen24_7: open247,
        acceptsEmergencies,
      };
      if (phone.trim()) clinicBody.phone = phone.trim();
      if (email.trim()) clinicBody.email = email.trim();
      if (lat.trim() && !Number.isNaN(Number(lat))) clinicBody.latitude = Number(lat);
      if (lng.trim() && !Number.isNaN(Number(lng))) clinicBody.longitude = Number(lng);
      await api('/clinic', { method: 'PATCH', body: clinicBody });

      // 3) Horarios de atención semanal
      await api('/clinic/hours', { method: 'PUT', body: { hours } });
    },
    onMutate: () => setFormError(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : 'No se pudo guardar.'),
  });

  const setHour = (i: number, patch: Partial<Hour>) =>
    setHours((hs) => hs.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));

  const rifValid = RIF_RE.test(rif.trim());

  return (
    <div>
      <PageHeader
        title="Configuración del Comercio"
        subtitle="Registra los datos legales, el perfil de la sucursal, coordenadas de atención móvil y los horarios operativos."
        actions={
          <div className="flex items-center gap-3">
            {saved && <span className="text-sm font-medium text-migo-green">✓ Guardado</span>}
            <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
              <Icon name="save" className="h-4 w-4" /> {save.isPending ? 'Guardando…' : 'Guardar Cambios'}
            </button>
          </div>
        }
      />

      {isLoading && <Spinner className="mx-auto mt-10" />}
      {error && <ErrorNote error={error} />}
      {formError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>
      )}

      {data && (
        <>
          {/* Datos legales del comercio (RIF requerido) */}
          <Card className="mb-6">
            <div className="mb-4 flex items-center justify-between">
              <SectionTitle>Datos Legales del Comercio</SectionTitle>
              <span
                className={`badge ${
                  data.organization?.verificationStatus === 'VERIFIED'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {data.organization?.verificationStatus === 'VERIFIED' ? '✓ Verificado' : 'En revisión'}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">Razón Social *</label>
                <input
                  className="input"
                  placeholder="Migo Clínicas Veterinarias C.A."
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">RIF del Comercio *</label>
                <input
                  className={`input ${rif && !rifValid ? 'border-red-400' : ''}`}
                  placeholder="J-40123456-7"
                  value={rif}
                  onChange={(e) => setRif(e.target.value.toUpperCase())}
                />
                {rif && !rifValid && (
                  <p className="mt-1 text-xs text-red-600">Formato esperado: J-40123456-7</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">Correo Comercial</label>
                <input
                  className="input"
                  type="email"
                  placeholder="admin@tuclinica.com"
                  value={orgEmail}
                  onChange={(e) => setOrgEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">Teléfono Comercial</label>
                <input
                  className="input"
                  placeholder="0212-0000000"
                  value={orgPhone}
                  onChange={(e) => setOrgPhone(e.target.value)}
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              El RIF es auditado por el Super Admin de Migo para verificar el comercio. Es obligatorio para operar en el
              directorio.
            </p>
          </Card>

          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <SectionTitle>Perfil Público de Sucursal</SectionTitle>
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="flex h-24 flex-col items-center justify-center gap-1 rounded-xl bg-slate-50 text-sm text-brand-600">
                  <Icon name="image" className="h-6 w-6" /> Subir Logotipo
                </div>
                <div className="flex h-24 flex-col items-center justify-center gap-1 rounded-xl bg-slate-50 text-sm text-brand-600">
                  <Icon name="camera" className="h-6 w-6" /> Foto de Fachada
                </div>
              </div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Nombre de la Sucursal *</label>
              <input className="input mb-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="Las Mercedes" />
              <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">Teléfono</label>
                  <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0212-0000000" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">Correo</label>
                  <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sucursal@tuclinica.com" />
                </div>
              </div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Descripción del Establecimiento</label>
              <textarea
                className="input h-24 resize-none"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Card>

            <Card>
              <SectionTitle>Ubicación GPS & Cobertura Móvil</SectionTitle>
              <div className="mb-3 flex h-24 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 text-brand-500">
                <Icon name="pin" className="h-10 w-10" />
              </div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Dirección</label>
              <input className="input mb-3" value={address} onChange={(e) => setAddress(e.target.value)} />
              <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">Ciudad</label>
                  <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">Estado</label>
                  <input className="input" value={stateName} onChange={(e) => setStateName(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">Latitud</label>
                  <input className="input" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="10.4806" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">Longitud</label>
                  <input className="input" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-66.8564" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Toggle on={open247} onClick={() => setOpen247((v) => !v)} label="Atención 24/7" />
                <Toggle
                  on={acceptsEmergencies}
                  onClick={() => setAcceptsEmergencies((v) => !v)}
                  label="Acepta urgencias del radar Migo"
                />
              </div>
            </Card>
          </div>

          <Card>
            <SectionTitle>Horarios de Atención Semanal</SectionTitle>
            <div className="space-y-2">
              {hours.map((h, i) => (
                <div key={h.dayOfWeek} className="flex flex-wrap items-center gap-3 border-b border-slate-50 py-2">
                  <span className="w-28 font-semibold text-slate-700">{DAYS[h.dayOfWeek]}</span>
                  <input
                    type="time"
                    className="input w-32 disabled:opacity-40"
                    value={h.opensAt}
                    disabled={!h.isOpen}
                    onChange={(e) => setHour(i, { opensAt: e.target.value })}
                  />
                  <span className="text-slate-400">a</span>
                  <input
                    type="time"
                    className="input w-32 disabled:opacity-40"
                    value={h.closesAt}
                    disabled={!h.isOpen}
                    onChange={(e) => setHour(i, { closesAt: e.target.value })}
                  />
                  <button
                    onClick={() => setHour(i, { isOpen: !h.isOpen })}
                    className={`badge ${h.isOpen ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {h.isOpen ? 'Abierto' : 'Cerrado'}
                  </button>
                  <button
                    onClick={() => setHour(i, { isOnCall: !h.isOnCall })}
                    className={`badge ${h.isOnCall ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-400'}`}
                    title="Guardia de urgencias 24h"
                  >
                    {h.isOnCall ? '🚨 Guardia' : 'Sin guardia'}
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Los días marcados como <span className="font-semibold text-red-600">Guardia</span> reciben alertas de urgencia
              fuera del horario regular.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
