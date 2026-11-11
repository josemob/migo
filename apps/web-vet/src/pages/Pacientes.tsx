import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { date } from '../lib/format';
import { Card, PageHeader, SectionTitle, Spinner, Badge, ErrorNote } from '../components/ui';
import { Icon } from '../components/Icon';
import { RecordDrawer } from '../components/RecordDetail';

interface PetRow {
  id: string;
  name: string;
  breed?: string;
  status: string;
  owner: { fullName: string };
  records?: { visitedAt: string }[];
}
interface Ficha {
  id: string;
  name: string;
  breed?: string;
  status: string;
  bloodType?: string;
  allergies: { substance: string }[];
  conditions: { name: string }[];
  vaccinations: { vaccineName: string; nextDueAt?: string; kind?: 'VACCINE' | 'DEWORMING'; recordedByOwner?: boolean }[];
  prescriptions: { drug: string; frequency?: string; durationDays?: number }[];
  records: { id: string; visitedAt: string; reason?: string; diagnosis?: string; signedAt?: string | null; clinicId?: string | null; clinic?: { name: string } | null }[];
}

const statusMap: Record<string, { tone: string; label: string }> = {
  URGENT: { tone: 'red', label: 'Atención Urgente' },
  CRITICAL: { tone: 'red', label: 'Paciente Crítico' },
  STABLE: { tone: 'green', label: 'Estable' },
  IN_TREATMENT: { tone: 'purple', label: 'Tratamiento' },
  INACTIVE: { tone: 'slate', label: 'Inactivo' },
};

export default function Pacientes() {
  const [search, setSearch] = useState('');
  const [by, setBy] = useState<'name' | 'nationalId' | 'microchip'>('name');
  // ?pet=…&record=… (desde 'Últimos historiales' del Resumen): abre la ficha y la consulta.
  const { user } = useAuth();
  const myClinicId = user?.staffProfile?.clinicId;
  const [params, setParams] = useSearchParams();
  const [selected, setSelectedState] = useState<string | null>(() => params.get('pet'));
  const openRecord = params.get('record');
  const [showAll, setShowAll] = useState(false);
  const setSelected = (id: string) => {
    setSelectedState(id);
    setShowAll(false);
    setParams({ pet: id }, { replace: true });
  };
  const setOpenRecord = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('record', id);
    else next.delete('record');
    setParams(next, { replace: true });
  };

  const list = useQuery({
    queryKey: ['patients', search, by],
    queryFn: () => api<{ data: PetRow[] }>(`/patients?by=${by}&search=${encodeURIComponent(search)}`),
  });
  const ficha = useQuery({
    queryKey: ['ficha', selected],
    queryFn: () => api<Ficha>(`/patients/${selected}`),
    enabled: !!selected,
  });

  const vaxUpToDate = (nextDueAt?: string) => !nextDueAt || new Date(nextDueAt) > new Date();

  return (
    <div>
      <PageHeader title="Pacientes & Historiales Clínicos" subtitle="Consulta, busca y actualiza las fichas médicas de las mascotas." />

      <div className="mb-6 flex flex-wrap gap-2">
        <input
          className="input flex-1"
          placeholder="Buscar por nombre, dueño, ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {(['nationalId', 'name', 'microchip'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setBy(k)}
            className={`btn ${by === k ? 'bg-migo-purple text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
          >
            {k === 'nationalId' ? 'Cédula' : k === 'name' ? 'Nombre de Mascota' : 'Microchip'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {list.isLoading && <Spinner className="mx-auto my-8" />}
          {list.error && <ErrorNote error={list.error} />}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-400">
                <th className="pb-2 font-medium">Mascota</th>
                <th className="pb-2 font-medium">Raza</th>
                <th className="pb-2 font-medium">Dueño</th>
                <th className="pb-2 font-medium">Última visita</th>
                <th className="pb-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.data.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-slate-400">Sin resultados.</td></tr>
              )}
              {list.data?.data.map((p) => {
                const st = statusMap[p.status] ?? { tone: 'slate', label: p.status };
                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelected(p.id)}
                    className={`cursor-pointer border-b border-slate-50 hover:bg-slate-50 ${selected === p.id ? 'bg-violet-50' : ''}`}
                  >
                    <td className="py-3 font-semibold text-slate-800">{p.name}</td>
                    <td className="py-3 text-slate-500">{p.breed}</td>
                    <td className="py-3 text-slate-500">{p.owner.fullName}</td>
                    <td className="py-3 text-slate-500">{p.records?.[0] ? date(p.records[0].visitedAt) : '—'}</td>
                    <td className="py-3"><Badge tone={st.tone}>{st.label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card>
          {!selected ? (
            <p className="py-8 text-center text-sm text-slate-400">Selecciona un paciente.</p>
          ) : ficha.isLoading ? (
            <Spinner className="mx-auto my-8" />
          ) : ficha.data ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <SectionTitle>Ficha Médica: {ficha.data.name}</SectionTitle>
                {(ficha.data.status === 'CRITICAL' || ficha.data.status === 'URGENT') && (
                  <span className="text-xs font-bold text-red-600">
                    {statusMap[ficha.data.status]?.label.toUpperCase()}
                  </span>
                )}
              </div>

              <Block title="Historial de Visitas">
                {ficha.data.records.length === 0 && <p className="text-sm text-slate-400">Sin visitas.</p>}
                {(showAll ? ficha.data.records : ficha.data.records.slice(0, 4)).map((r) => {
                  const other = !!myClinicId && !!r.clinicId && r.clinicId !== myClinicId;
                  return (
                  <button
                    disabled={other}
                    title={other ? 'Consulta registrada por otra clínica' : undefined}
                    key={r.id}
                    type="button"
                    onClick={() => setOpenRecord(r.id)}
                    className={`group -mx-2 mb-1 flex w-[calc(100%+1rem)] items-center gap-2 rounded-xl px-2 py-1.5 text-left transition enabled:hover:bg-brand-50/70 disabled:cursor-default ${openRecord === r.id ? 'bg-brand-50/70' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                        <span className="truncate">{r.reason ?? 'Consulta'}</span>
                        {!other && !r.signedAt && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-bold text-amber-700">Borrador</span>}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {date(r.visitedAt)}{other ? ` · ${r.clinic?.name ?? 'Otra clínica'}` : r.diagnosis && ` - ${r.diagnosis}`}
                      </div>
                    </div>
                    {!other && <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-migo-purple" />}
                  </button>
                  );
                })}
                {ficha.data.records.length > 4 && (
                  <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 text-xs font-semibold text-migo-purple hover:underline">
                    {showAll ? 'Ver menos' : `Ver todas (${ficha.data.records.length})`}
                  </button>
                )}
              </Block>

              <Block title="Esquema de Vacunación">
                {ficha.data.vaccinations.map((v, i) => (
                  <div key={i} className="flex items-center justify-between py-0.5 text-sm">
                    <span className="text-slate-700">
                      {v.kind === 'DEWORMING' ? '🪱 ' : ''}
                      {v.vaccineName}
                      {v.recordedByOwner && <span className="ml-1.5 text-xs font-semibold text-amber-600">· Registrada por el dueño</span>}
                    </span>
                    {vaxUpToDate(v.nextDueAt) ? (
                      <Badge tone="green">Al Día</Badge>
                    ) : (
                      <Badge tone="red">Vencida</Badge>
                    )}
                  </div>
                ))}
              </Block>

              {ficha.data.allergies.length > 0 && (
                <Block title="Alergias Conocidas">
                  <div className="flex flex-wrap gap-2">
                    {ficha.data.allergies.map((a, i) => (
                      <span key={i} className="badge border border-red-200 bg-red-50 text-red-600">
                        {a.substance}
                      </span>
                    ))}
                  </div>
                </Block>
              )}

              {ficha.data.prescriptions.length > 0 && (
                <Block title="Últimas Prescripciones">
                  {ficha.data.prescriptions.slice(0, 3).map((p, i) => (
                    <div key={i} className="text-sm text-slate-700">
                      • <b>{p.drug}</b>{' '}
                      {(p.frequency || p.durationDays) && (
                        <span className="text-slate-400">
                          ({p.frequency}{p.durationDays ? ` por ${p.durationDays} días` : ''})
                        </span>
                      )}
                    </div>
                  ))}
                </Block>
              )}
            </div>
          ) : null}
        </Card>
      </div>

      <RecordDrawer recordId={openRecord} onClose={() => setOpenRecord(null)} />
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 border-t border-slate-100 pt-3">
      <h4 className="mb-2 font-bold text-slate-800">{title}</h4>
      {children}
    </div>
  );
}
