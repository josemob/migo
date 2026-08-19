import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, PageHeader, SectionTitle, Spinner, Badge, ErrorNote } from '../components/ui';
import { Modal, Field } from '../components/Modal';
import { Icon } from '../components/Icon';

interface Staff {
  id: string;
  position: string;
  roleLabel?: string;
  specialty?: string;
  collegiateNumber?: string;
  experienceYears?: number | null;
  verificationStatus: string;
  isActive: boolean;
  user: { fullName: string };
}
interface StaffResp {
  data: Staff[];
  capacity: { used: number; total: number };
}
interface ShiftsResp {
  data: { id: string; shift: string; staff: { user: { fullName: string } } }[];
}
interface SearchResult {
  userId: string;
  fullName: string;
  email: string;
  nationalId?: string | null;
  position: string;
  specialty?: string | null;
  collegiateNumber?: string | null;
  alreadyStaff: boolean;
  alreadyInvited: boolean;
}

const POSITIONS = [
  { key: 'VET', label: 'Veterinario (CMV)' },
  { key: 'GROOMER', label: 'Estética / Grooming' },
  { key: 'RECEPTIONIST', label: 'Recepcionista' },
  { key: 'SUPPORT', label: 'Personal de Apoyo' },
];
const POSITION_LABEL: Record<string, string> = {
  VET: 'Veterinario/a', GROOMER: 'Peluquero / Estética', RECEPTIONIST: 'Recepción', SUPPORT: 'Personal de apoyo', BRANCH_ADMIN: 'Admin de sucursal',
};
const positionBadge: Record<string, { tone: string; label: string }> = {
  VET: { tone: 'green', label: 'CMV Verificado' },
  GROOMER: { tone: 'amber', label: 'Personal de Apoyo' },
  SUPPORT: { tone: 'amber', label: 'Personal de Apoyo' },
  RECEPTIONIST: { tone: 'amber', label: 'Recepcionista' },
  BRANCH_ADMIN: { tone: 'purple', label: 'Admin Local' },
};
const shiftLabel: Record<string, string> = {
  MORNING: 'Guardia Mañana', AFTERNOON: 'Guardia Tarde', NIGHT: 'Guardia Noche', FULL_DAY: 'Día completo', OFF: 'Libre Hoy',
};

export default function Equipo() {
  const qc = useQueryClient();
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Staff | null>(null);
  const [cmvId, setCmvId] = useState('');
  const [cmvResult, setCmvResult] = useState('');

  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api<StaffResp>('/staff') });
  const shifts = useQuery({ queryKey: ['shifts'], queryFn: () => api<ShiftsResp>('/staff/shifts/today') });

  const term = q.trim();
  const search = useQuery({
    queryKey: ['staff-search', term],
    queryFn: () => api<{ data: SearchResult[] }>(`/staff/search?q=${encodeURIComponent(term)}`),
    enabled: searchOpen && term.length >= 2,
  });

  const inviteMut = useMutation({
    mutationFn: (userId: string) => api('/staff/invite', { method: 'POST', body: { userId } }),
    onSuccess: (_r, userId) => { setInvited((s) => new Set(s).add(userId)); },
  });

  const updateStaff = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/staff/${id}`, { method: 'PATCH', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff'] }); setEditing(null); },
  });

  const validateCmv = useMutation({
    mutationFn: (nationalId: string) => api<{ found: boolean; message?: string }>('/staff/validate-cmv', { method: 'POST', body: { nationalId } }),
    onSuccess: (r) => setCmvResult(r.found ? '✅ Profesional encontrado en el registro CMV.' : (r.message ?? 'No encontrado en el registro.')),
  });

  const closeSearch = () => { setSearchOpen(false); setQ(''); };

  return (
    <div>
      <PageHeader
        title="Gestión de Equipo & Staff"
        subtitle="Administra los veterinarios, especialistas y personal de soporte técnico de la clínica."
        actions={
          <button className="btn-primary" onClick={() => setSearchOpen(true)}>
            <Icon name="plus" className="h-4 w-4" /> Invitar Personal
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center gap-3">
            <SectionTitle>Personal Activo en Sucursal</SectionTitle>
            {staff.data && (
              <span className="badge bg-violet-100 text-violet-700">Capacidad: {staff.data.capacity.used}/{staff.data.capacity.total} Asesores</span>
            )}
          </div>

          {staff.isLoading && <Spinner className="mx-auto my-8" />}
          {staff.error && <ErrorNote error={staff.error} />}

          <div className="space-y-3">
            {staff.data?.data.map((m) => {
              const b = positionBadge[m.position] ?? { tone: 'slate', label: m.position };
              return (
                <div key={m.id} className="flex items-center gap-4 rounded-xl border border-slate-100 p-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-lg font-bold text-migo-purple">{m.user.fullName[0]}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{m.user.fullName}</span>
                      <Badge tone={b.tone}>{b.label}</Badge>
                      {!m.isActive && <Badge tone="slate">Inactivo</Badge>}
                    </div>
                    <div className="text-sm text-slate-500">
                      {m.specialty ? `Especialidad: ${m.specialty}${m.collegiateNumber ? ` · Colegiado: #${m.collegiateNumber}` : ''}` : (m.roleLabel ?? 'Personal de la sucursal')}
                    </div>
                  </div>
                  <button className="btn-outline" onClick={() => setEditing(m)}>Editar Rol</button>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <SectionTitle>Reclutar personal verificado</SectionTitle>
            <p className="mb-3 text-sm text-slate-500">Busca por cédula, correo o nombre a profesionales ya verificados por Migo e invítalos a tu equipo.</p>
            <button className="btn-primary w-full" onClick={() => setSearchOpen(true)}>
              <Icon name="search" className="h-4 w-4" /> Buscar e invitar
            </button>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Validar registro CMV (opcional)</p>
            <input className="input mt-2" placeholder="V-18247592" value={cmvId} onChange={(e) => setCmvId(e.target.value)} />
            <button className="btn-outline mt-2 w-full" disabled={validateCmv.isPending || !cmvId} onClick={() => validateCmv.mutate(cmvId)}>Validar con Registro CMV</button>
            {cmvResult && <p className="mt-2 text-sm text-slate-600">{cmvResult}</p>}
          </Card>

          <Card>
            <SectionTitle>Guardias & Especialistas Hoy</SectionTitle>
            {shifts.isLoading && <Spinner className="mx-auto my-4" />}
            {shifts.data?.data.length === 0 && <p className="text-sm text-slate-400">Sin guardias asignadas hoy.</p>}
            <ul className="space-y-2">
              {shifts.data?.data.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <span className={`h-2.5 w-2.5 rounded-full ${s.shift === 'OFF' ? 'bg-red-400' : 'bg-green-500'}`} />
                  <span className="font-medium text-slate-700">{s.staff.user.fullName}</span>
                  <span className="text-slate-400">— {shiftLabel[s.shift] ?? s.shift}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {/* Buscar e invitar */}
      <Modal
        open={searchOpen}
        onClose={closeSearch}
        title="Invitar personal a la clínica"
        footer={<button className="btn-outline" onClick={closeSearch}>Cerrar</button>}
      >
        <p className="mb-3 text-sm text-slate-500">Busca profesionales <b>verificados</b> por cédula, correo o nombre e invítalos. Recibirán una notificación para aceptar o rechazar.</p>
        <input className="input" placeholder="Cédula, correo o nombre…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />

        <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
          {term.length < 2 ? (
            <p className="py-6 text-center text-sm text-slate-400">Escribe al menos 2 caracteres para buscar.</p>
          ) : search.isLoading ? (
            <Spinner className="mx-auto my-6" />
          ) : search.error ? (
            <ErrorNote error={search.error} />
          ) : (search.data?.data.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Sin profesionales verificados que coincidan.</p>
          ) : (
            search.data!.data.map((r) => {
              const done = r.alreadyInvited || invited.has(r.userId);
              return (
                <div key={r.userId} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-migo-purple">{r.fullName[0]}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-slate-900">{r.fullName}</span>
                      <Badge tone="purple">{POSITION_LABEL[r.position] ?? r.position}</Badge>
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      Cédula {r.nationalId ?? '—'}{r.specialty ? ` · ${r.specialty}` : ''}{r.collegiateNumber ? ` · Colegiado #${r.collegiateNumber}` : ''}
                    </div>
                  </div>
                  {r.alreadyStaff ? (
                    <span className="shrink-0 text-xs font-semibold text-slate-400">Ya en una sucursal</span>
                  ) : done ? (
                    <span className="shrink-0 text-sm font-semibold text-green-600">✓ Invitado</span>
                  ) : (
                    <button className="btn-primary shrink-0" disabled={inviteMut.isPending} onClick={() => inviteMut.mutate(r.userId)}>Invitar</button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Modal>

      {/* Editar rol */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Editar: ${editing?.user.fullName ?? ''}`}
        footer={
          <>
            <button className="btn-outline" onClick={() => setEditing(null)}>Cancelar</button>
            <button className="btn-primary" disabled={updateStaff.isPending} onClick={() => editing && updateStaff.mutate({ id: editing.id, body: { position: editing.position, roleLabel: editing.roleLabel, specialty: editing.specialty || undefined, experienceYears: editing.experienceYears ?? null, isActive: editing.isActive } })}>Guardar</button>
          </>
        }
      >
        {editing && (
          <div>
            <Field label="Posición">
              <select className="input" value={editing.position} onChange={(e) => setEditing({ ...editing, position: e.target.value })}>
                {POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="Rol / etiqueta"><input className="input" value={editing.roleLabel ?? ''} onChange={(e) => setEditing({ ...editing, roleLabel: e.target.value })} /></Field>
            {editing.position === 'VET' && (
              <>
                <Field label="Especialidad"><input className="input" placeholder="Medicina de pequeñas especies" value={editing.specialty ?? ''} onChange={(e) => setEditing({ ...editing, specialty: e.target.value })} /></Field>
                <Field label="Años de experiencia"><input className="input" type="number" min={0} max={80} placeholder="12" value={editing.experienceYears ?? ''} onChange={(e) => setEditing({ ...editing, experienceYears: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
              </>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} />
              Activo en la sucursal
            </label>
            {editing.position === 'VET' && editing.verificationStatus !== 'VERIFIED' && (
              <button className="btn-green mt-4 w-full" onClick={() => updateStaff.mutate({ id: editing.id, body: { verificationStatus: 'VERIFIED' } })}>✅ Marcar CMV Verificado</button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
