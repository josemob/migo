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

const POSITIONS = [
  { key: 'VET', label: 'Veterinario (CMV)' },
  { key: 'GROOMER', label: 'Estética / Grooming' },
  { key: 'RECEPTIONIST', label: 'Recepcionista' },
  { key: 'SUPPORT', label: 'Personal de Apoyo' },
];
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

interface InviteForm {
  fullName: string; email: string; phone: string; nationalId: string;
  position: string; roleLabel: string; specialty: string; collegiateNumber: string; tempPassword: string;
}
const emptyInvite = (): InviteForm => ({
  fullName: '', email: '', phone: '', nationalId: '', position: 'VET',
  roleLabel: '', specialty: '', collegiateNumber: '', tempPassword: '',
});

export default function Equipo() {
  const qc = useQueryClient();
  const [invite, setInvite] = useState<InviteForm | null>(null);
  const [inviteError, setInviteError] = useState('');
  const [editing, setEditing] = useState<Staff | null>(null);
  const [cmvId, setCmvId] = useState('');
  const [cmvResult, setCmvResult] = useState('');

  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api<StaffResp>('/staff') });
  const shifts = useQuery({ queryKey: ['shifts'], queryFn: () => api<ShiftsResp>('/staff/shifts/today') });

  const createStaff = useMutation({
    mutationFn: (f: InviteForm) =>
      api('/staff', {
        method: 'POST',
        body: {
          fullName: f.fullName, email: f.email, phone: f.phone || undefined,
          nationalId: f.nationalId || undefined, position: f.position,
          roleLabel: f.roleLabel || undefined, specialty: f.specialty || undefined,
          collegiateNumber: f.collegiateNumber || undefined, tempPassword: f.tempPassword,
        },
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff'] }); setInvite(null); },
    onError: (e) => setInviteError(e instanceof Error ? e.message : 'Error al invitar'),
  });

  const updateStaff = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/staff/${id}`, { method: 'PATCH', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff'] }); setEditing(null); },
  });

  const validateCmv = useMutation({
    mutationFn: (nationalId: string) => api<{ found: boolean; message?: string }>('/staff/validate-cmv', { method: 'POST', body: { nationalId } }),
    onSuccess: (r) => setCmvResult(r.found ? '✅ Profesional encontrado en el registro CMV.' : (r.message ?? 'No encontrado en el registro.')),
  });

  return (
    <div>
      <PageHeader
        title="Gestión de Equipo & Staff"
        subtitle="Administra los veterinarios, especialistas y personal de soporte técnico de la clínica."
        actions={
          <button className="btn-primary" onClick={() => { setInviteError(''); setInvite(emptyInvite()); }}>
            <Icon name="plus" className="h-4 w-4" /> Invitar Personal
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center gap-3">
            <SectionTitle>Personal Activo en Sucursal</SectionTitle>
            {staff.data && (
              <span className="badge bg-violet-100 text-violet-700">
                Capacidad: {staff.data.capacity.used}/{staff.data.capacity.total} Asesores
              </span>
            )}
          </div>

          {staff.isLoading && <Spinner className="mx-auto my-8" />}
          {staff.error && <ErrorNote error={staff.error} />}

          <div className="space-y-3">
            {staff.data?.data.map((m) => {
              const b = positionBadge[m.position] ?? { tone: 'slate', label: m.position };
              return (
                <div key={m.id} className="flex items-center gap-4 rounded-xl border border-slate-100 p-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-lg font-bold text-migo-purple">
                    {m.user.fullName[0]}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{m.user.fullName}</span>
                      <Badge tone={b.tone}>{b.label}</Badge>
                      {!m.isActive && <Badge tone="slate">Inactivo</Badge>}
                    </div>
                    <div className="text-sm text-slate-500">
                      {m.specialty
                        ? `Especialidad: ${m.specialty}${m.collegiateNumber ? ` · Colegiado: #${m.collegiateNumber}` : ''}`
                        : (m.roleLabel ?? 'Personal de la sucursal')}
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
            <SectionTitle>Invitar Médico / Especialista</SectionTitle>
            <p className="mb-3 text-sm text-slate-500">
              Busca y asocia profesionales homologados ingresando su cédula o número de registro colegiado nacional.
            </p>
            <input className="input mb-3" placeholder="V-18247592" value={cmvId} onChange={(e) => setCmvId(e.target.value)} />
            <button className="btn-primary w-full" disabled={validateCmv.isPending || !cmvId} onClick={() => validateCmv.mutate(cmvId)}>
              <Icon name="search" className="h-4 w-4" /> Validar con Registro CMV
            </button>
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

      {/* Invitar */}
      <Modal
        open={!!invite}
        onClose={() => setInvite(null)}
        title="Invitar Personal"
        footer={
          <>
            <button className="btn-outline" onClick={() => setInvite(null)}>Cancelar</button>
            <button className="btn-primary" disabled={createStaff.isPending} onClick={() => invite && createStaff.mutate(invite)}>
              {createStaff.isPending ? 'Invitando…' : 'Invitar'}
            </button>
          </>
        }
      >
        {invite && (
          <div>
            {inviteError && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{inviteError}</div>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre completo"><input className="input" value={invite.fullName} onChange={(e) => setInvite({ ...invite, fullName: e.target.value })} /></Field>
              <Field label="Correo"><input className="input" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /></Field>
              <Field label="Teléfono"><input className="input" value={invite.phone} onChange={(e) => setInvite({ ...invite, phone: e.target.value })} /></Field>
              <Field label="Cédula"><input className="input" value={invite.nationalId} onChange={(e) => setInvite({ ...invite, nationalId: e.target.value })} /></Field>
            </div>
            <Field label="Posición">
              <select className="input" value={invite.position} onChange={(e) => setInvite({ ...invite, position: e.target.value })}>
                {POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </Field>
            {invite.position === 'VET' ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Especialidad"><input className="input" value={invite.specialty} onChange={(e) => setInvite({ ...invite, specialty: e.target.value })} /></Field>
                <Field label="N° Colegiado"><input className="input" value={invite.collegiateNumber} onChange={(e) => setInvite({ ...invite, collegiateNumber: e.target.value })} /></Field>
              </div>
            ) : (
              <Field label="Rol / función"><input className="input" placeholder="Ej. Estética & Grooming" value={invite.roleLabel} onChange={(e) => setInvite({ ...invite, roleLabel: e.target.value })} /></Field>
            )}
            <Field label="Contraseña temporal (mín. 8)"><input className="input" type="text" value={invite.tempPassword} onChange={(e) => setInvite({ ...invite, tempPassword: e.target.value })} /></Field>
          </div>
        )}
      </Modal>

      {/* Editar rol */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Editar: ${editing?.user.fullName ?? ''}`}
        footer={
          <>
            <button className="btn-outline" onClick={() => setEditing(null)}>Cancelar</button>
            <button
              className="btn-primary"
              disabled={updateStaff.isPending}
              onClick={() => editing && updateStaff.mutate({ id: editing.id, body: { position: editing.position, roleLabel: editing.roleLabel, isActive: editing.isActive } })}
            >
              Guardar
            </button>
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
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} />
              Activo en la sucursal
            </label>
            {editing.position === 'VET' && editing.verificationStatus !== 'VERIFIED' && (
              <button
                className="btn-green mt-4 w-full"
                onClick={() => updateStaff.mutate({ id: editing.id, body: { verificationStatus: 'VERIFIED' } })}
              >
                ✅ Marcar CMV Verificado
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
