import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Card, ErrorNote, PageHeader, SectionTitle, Spinner } from '../components/ui';

interface Pet { name: string; species: string }
interface User {
  id: string;
  fullName: string;
  email: string;
  nationalId?: string | null;
  status: string;
  avatarUrl?: string | null;
  lastAccess: string;
  bookings: number;
  pets: Pet[];
  subscription: { plan: string; priceUsd: string; renewsAt?: string | null } | null;
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });

export default function Usuarios() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-users', q], queryFn: () => api<{ data: User[] }>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`) });

  const suspend = useMutation({
    mutationFn: (v: { id: string; suspend: boolean }) => api(`/admin/users/${v.id}/suspend`, { method: 'POST', body: { suspend: v.suspend } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
  const push = useMutation({
    mutationFn: (v: { id: string; title: string; body: string }) => api(`/admin/users/${v.id}/push`, { method: 'POST', body: { title: v.title, body: v.body } }),
  });

  const users = data?.data ?? [];
  const selected = useMemo(() => users.find((u) => u.id === selectedId) ?? users[0] ?? null, [users, selectedId]);

  const sendPush = (u: User) => {
    const body = window.prompt(`Notificación push para ${u.fullName}:`, 'Recuerda la vacuna de tu mascota 🐾');
    if (body) push.mutate({ id: u.id, title: 'Migo', body });
  };

  return (
    <div>
      <PageHeader
        title="Usuarios & Mascotas (B2C)"
        subtitle="Monitoreo de dueños de mascotas registrados, historial de uso y suscripciones activas."
        actions={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cédula, nombre, correo…" className="w-64 rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-brand-500" />}
      />

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : error ? (
        <ErrorNote error={error} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <SectionTitle>Base de Clientes B2C</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-3 pr-4 font-semibold">Nombre / Correo</th>
                    <th className="py-3 pr-4 font-semibold">Cédula</th>
                    <th className="py-3 pr-4 font-semibold">Mascotas</th>
                    <th className="py-3 pr-4 font-semibold">Suscripción</th>
                    <th className="py-3 pr-4 font-semibold">Reservas</th>
                    <th className="py-3 font-semibold">Último Acceso</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr><td colSpan={6} className="py-10 text-center text-slate-400">Sin usuarios.</td></tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} onClick={() => setSelectedId(u.id)} className={`cursor-pointer border-b border-slate-50 hover:bg-slate-50 ${selected?.id === u.id ? 'bg-brand-50/50' : ''}`}>
                        <td className="py-3 pr-4"><div className="font-semibold text-slate-800">{u.fullName}</div><div className="text-xs text-slate-400">{u.email}</div></td>
                        <td className="py-3 pr-4 text-slate-500">{u.nationalId ?? '—'}</td>
                        <td className="py-3 pr-4 text-slate-500">{u.pets.map((p) => p.name).join(', ') || '—'}</td>
                        <td className="py-3 pr-4">{u.subscription ? <Badge tone="green">Migo Care</Badge> : <Badge tone="slate">Sin suscripción</Badge>}</td>
                        <td className="py-3 pr-4 font-semibold text-slate-700">{u.bookings}</td>
                        <td className="py-3 text-slate-500">{fmtDate(u.lastAccess)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <SectionTitle>Perfil de Usuario</SectionTitle>
            {!selected ? (
              <p className="text-sm text-slate-400">Selecciona un usuario.</p>
            ) : (
              <div>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-lg font-bold text-migo-purple">{selected.fullName[0]}</div>
                  <div>
                    <div className="font-bold text-slate-900">{selected.fullName}</div>
                    <div className="text-xs text-slate-400">{selected.nationalId ?? '—'}</div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: selected.subscription ? '#C6E9D2' : '#E2E8F0', background: selected.subscription ? '#E8F6ED' : '#F8FAFC' }}>
                  {selected.subscription ? (
                    <div className="flex items-center justify-between"><span className="font-semibold text-green-700">🛡️ Migo Care Activa</span><span className="font-bold text-green-700">${Number(selected.subscription.priceUsd).toFixed(2)}/mes</span></div>
                  ) : (
                    <span className="text-slate-500">Sin suscripción activa</span>
                  )}
                </div>

                <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Mascotas registradas ({selected.pets.length})</div>
                <div className="mt-2 space-y-2">
                  {selected.pets.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>🐾</span><span className="font-medium text-slate-700">{p.name}</span><span className="text-xs text-slate-400">· {p.species}</span></div>
                  ))}
                  {selected.pets.length === 0 && <p className="text-sm text-slate-400">Sin mascotas.</p>}
                </div>

                <div className="mt-5 space-y-2">
                  <button onClick={() => sendPush(selected)} disabled={push.isPending} className="w-full rounded-xl bg-brand-500 py-2.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">✉️ Enviar Notificación Push</button>
                  <button
                    onClick={() => suspend.mutate({ id: selected.id, suspend: selected.status !== 'SUSPENDED' })}
                    disabled={suspend.isPending}
                    className={`w-full rounded-xl border py-2.5 font-semibold disabled:opacity-60 ${selected.status === 'SUSPENDED' ? 'border-green-300 text-green-700 hover:bg-green-50' : 'border-red-300 text-red-600 hover:bg-red-50'}`}
                  >
                    {selected.status === 'SUSPENDED' ? '✓ Reactivar Cuenta' : '⚠ Suspender Cuenta de Usuario'}
                  </button>
                  {push.isSuccess && <p className="text-center text-xs text-green-600">Notificación enviada.</p>}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
