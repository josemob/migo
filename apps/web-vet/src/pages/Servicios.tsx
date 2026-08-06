import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { usd } from '../lib/format';
import { Card, PageHeader, Spinner, ErrorNote } from '../components/ui';
import { Modal, Field } from '../components/Modal';
import { Icon } from '../components/Icon';

interface StaffLite {
  id: string;
  name: string;
  position: string;
}
interface Service {
  id: string;
  name: string;
  category: string;
  description?: string;
  priceUsd: string;
  durationMin: number;
  staff?: StaffLite[];
}
interface ServicesResp {
  data: Service[];
  medicalServicesEnabled: boolean;
}

interface StaffMember {
  id: string;
  position: string;
  roleLabel?: string | null;
  isActive: boolean;
  user: { fullName: string };
}
interface StaffResp {
  data: StaffMember[];
}

const POSITION_LABEL: Record<string, string> = {
  VET: 'Veterinario',
  GROOMER: 'Estética',
  SUPPORT: 'Apoyo',
  RECEPTIONIST: 'Recepción',
  BRANCH_ADMIN: 'Admin',
};

const TABS = [
  { key: 'CONSULTATION', label: 'Consultas' },
  { key: 'VACCINATION', label: 'Vacunas' },
  { key: 'GROOMING', label: 'Estética' },
  { key: 'LAB', label: 'Laboratorio' },
  { key: 'SURGERY', label: 'Cirugías' },
];

interface FormState {
  id?: string;
  name: string;
  category: string;
  description: string;
  priceUsd: string;
  durationMin: string;
  staffIds: string[];
}
const emptyForm = (category: string): FormState => ({
  name: '',
  category,
  description: '',
  priceUsd: '',
  durationMin: '30',
  staffIds: [],
});

export default function Servicios() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>('CONSULTATION');
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['services'],
    queryFn: () => api<ServicesResp>('/services'),
  });

  const staffQuery = useQuery({
    queryKey: ['staff'],
    queryFn: () => api<StaffResp>('/staff'),
  });
  const staffList = (staffQuery.data?.data ?? []).filter((s) => s.isActive);

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const body = {
        name: f.name,
        category: f.category,
        description: f.description || undefined,
        priceUsd: Number(f.priceUsd),
        durationMin: Number(f.durationMin),
        staffIds: f.staffIds,
      };
      return f.id
        ? api(`/services/${f.id}`, { method: 'PATCH', body })
        : api('/services', { method: 'POST', body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] });
      setForm(null);
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : 'Error al guardar'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/services/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });

  const filtered = data?.data.filter((s) => s.category === tab) ?? [];

  const openEdit = (s: Service) =>
    setForm({
      id: s.id,
      name: s.name,
      category: s.category,
      description: s.description ?? '',
      priceUsd: String(s.priceUsd),
      durationMin: String(s.durationMin),
      staffIds: (s.staff ?? []).map((x) => x.id),
    });

  const toggleStaff = (id: string) =>
    setForm((f) =>
      f ? { ...f, staffIds: f.staffIds.includes(id) ? f.staffIds.filter((x) => x !== id) : [...f.staffIds, id] } : f,
    );

  return (
    <div>
      <PageHeader
        title="Catálogo de Servicios & Precios"
        subtitle="Asigna precios, duraciones de turno y gestiona las prestaciones de salud que ofrece tu clínica."
        actions={
          <button
            className="btn-primary"
            onClick={() => {
              setFormError('');
              setForm(emptyForm(tab));
            }}
          >
            <Icon name="plus" className="h-4 w-4" /> Agregar Servicio
          </button>
        }
      />

      {data && !data.medicalServicesEnabled && (
        <div className="mb-6 rounded-card border border-amber-300 bg-amber-50 px-5 py-4 text-sm font-medium text-amber-800">
          ⚠️ ALERTA: Los servicios médicos y quirúrgicos requieren al menos un Veterinario activo con
          Carnet CMV verificado en el sistema.
        </div>
      )}

      <div className="mb-6 flex gap-2 rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === t.key ? 'bg-white text-slate-900 shadow' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <Spinner className="mx-auto mt-10" />}
      {error && <ErrorNote error={error} />}

      {data && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.length === 0 && (
            <p className="col-span-2 py-8 text-center text-sm text-slate-400">
              No hay servicios en esta categoría.
            </p>
          )}
          {filtered.map((s) => (
            <Card key={s.id}>
              <div className="mb-2 flex items-start justify-between">
                <h3 className="text-lg font-bold text-slate-900">{s.name}</h3>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(s)}
                    className="rounded-lg bg-brand-100 p-2 text-brand-600 hover:bg-brand-200"
                  >
                    <Icon name="edit" className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => confirm(`¿Eliminar "${s.name}"?`) && remove.mutate(s.id)}
                    className="rounded-lg bg-red-50 p-2 text-red-500 hover:bg-red-100"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="mb-4 text-sm text-slate-500">{s.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-brand-600">Duración: {s.durationMin} min</span>
                <span className="font-heading text-lg font-extrabold text-migo-green">{usd(s.priceUsd)}</span>
              </div>
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Atiende</p>
                {s.staff && s.staff.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {s.staff.map((m) => (
                      <span
                        key={m.id}
                        className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700"
                        title={POSITION_LABEL[m.position] ?? m.position}
                      >
                        {m.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Sin staff asignado — cualquiera puede atenderlo.</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? 'Editar Servicio' : 'Nuevo Servicio'}
        footer={
          <>
            <button className="btn-outline" onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button
              className="btn-primary"
              disabled={save.isPending}
              onClick={() => form && save.mutate(form)}
            >
              {save.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        {form && (
          <div>
            {formError && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            )}
            <Field label="Nombre del servicio">
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Categoría">
              <select
                className="input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {TABS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Descripción">
              <textarea
                className="input h-20 resize-none"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Precio (USD)">
                <input
                  type="number"
                  className="input"
                  value={form.priceUsd}
                  onChange={(e) => setForm({ ...form, priceUsd: e.target.value })}
                />
              </Field>
              <Field label="Duración (min)">
                <input
                  type="number"
                  className="input"
                  value={form.durationMin}
                  onChange={(e) => setForm({ ...form, durationMin: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Staff que puede atender este servicio">
              {staffList.length === 0 ? (
                <p className="text-sm text-slate-400">No hay personal activo en la sucursal.</p>
              ) : (
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  {staffList.map((m) => {
                    const checked = form.staffIds.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                          checked ? 'bg-brand-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleStaff(m.id)}
                          className="h-4 w-4 accent-brand-600"
                        />
                        <span className="font-medium text-slate-800">{m.user.fullName}</span>
                        <span className="ml-auto text-xs text-slate-400">
                          {POSITION_LABEL[m.position] ?? m.position}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              <p className="mt-1 text-xs text-slate-400">
                Si no seleccionas a nadie, el servicio queda disponible para todo el equipo.
              </p>
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
