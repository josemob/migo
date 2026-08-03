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
}
interface Clinic {
  name: string;
  description?: string;
  address?: string;
  latitude?: string;
  longitude?: string;
  hours: Hour[];
}

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function Configuracion() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['clinic'], queryFn: () => api<Clinic>('/clinic') });

  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [hours, setHours] = useState<Hour[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    setDescription(data.description ?? '');
    setAddress(data.address ?? '');
    setHours(
      ORDER.map(
        (d) =>
          data.hours.find((h) => h.dayOfWeek === d) ?? {
            dayOfWeek: d,
            opensAt: '08:00',
            closesAt: '18:00',
            isOpen: false,
          },
      ),
    );
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      await api('/clinic', { method: 'PATCH', body: { description, address } });
      await api('/clinic/hours', { method: 'PUT', body: { hours } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const setHour = (i: number, patch: Partial<Hour>) =>
    setHours((hs) => hs.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));

  return (
    <div>
      <PageHeader
        title="Configuración del Comercio"
        subtitle="Administra el perfil de la sucursal, coordenadas para atención móvil y horarios operativos."
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

      {data && (
        <>
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
              <label className="mb-1 block text-sm font-medium text-slate-600">Descripción del Establecimiento</label>
              <textarea
                className="input h-24 resize-none"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Card>

            <Card>
              <SectionTitle>Ubicación GPS & Cobertura Móvil</SectionTitle>
              <div className="mb-3 flex h-32 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 text-brand-500">
                <Icon name="pin" className="h-12 w-12" />
              </div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Dirección</label>
              <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
              {data.latitude && (
                <div className="mt-2 text-xs text-slate-400">
                  Lat: {data.latitude} · Lng: {data.longitude}
                </div>
              )}
            </Card>
          </div>

          <Card>
            <SectionTitle>Horarios de Atención Semanal</SectionTitle>
            <div className="space-y-2">
              {hours.map((h, i) => (
                <div key={h.dayOfWeek} className="flex items-center gap-4 border-b border-slate-50 py-2">
                  <span className="w-28 font-semibold text-slate-700">{DAYS[h.dayOfWeek]}</span>
                  <input
                    type="time"
                    className="input w-32"
                    value={h.opensAt}
                    onChange={(e) => setHour(i, { opensAt: e.target.value })}
                  />
                  <span className="text-slate-400">a</span>
                  <input
                    type="time"
                    className="input w-32"
                    value={h.closesAt}
                    onChange={(e) => setHour(i, { closesAt: e.target.value })}
                  />
                  <button
                    onClick={() => setHour(i, { isOpen: !h.isOpen })}
                    className={`badge ${h.isOpen ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {h.isOpen ? 'Abierto' : 'Cerrado'}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
