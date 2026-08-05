import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Card, ErrorNote, PageHeader, Spinner } from '../components/ui';
import { Field, Modal, inputCls } from '../components/Modal';
import { Icon } from '../components/Icon';

interface Rule { id: string; name: string; keywords: string[]; responseTemplate: string; severity: string; active: boolean }
interface Knowledge { id: string; title: string; category: string; severity: string; description: string }

const sevTone: Record<string, string> = { Crítica: 'red', Moderada: 'amber', Leve: 'green' };

export default function MigoAI() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [showRule, setShowRule] = useState(false);
  const [showKb, setShowKb] = useState(false);

  const rules = useQuery({ queryKey: ['admin-ai-rules'], queryFn: () => api<{ data: Rule[] }>('/admin/ai/rules') });
  const kb = useQuery({ queryKey: ['admin-ai-kb', q], queryFn: () => api<{ data: Knowledge[] }>(`/admin/ai/knowledge${q ? `?q=${encodeURIComponent(q)}` : ''}`) });

  const invalidateRules = () => qc.invalidateQueries({ queryKey: ['admin-ai-rules'] });
  const invalidateKb = () => qc.invalidateQueries({ queryKey: ['admin-ai-kb'] });

  const toggle = useMutation({ mutationFn: (id: string) => api(`/admin/ai/rules/${id}/toggle`, { method: 'POST' }), onSuccess: invalidateRules });
  const delRule = useMutation({ mutationFn: (id: string) => api(`/admin/ai/rules/${id}`, { method: 'DELETE' }), onSuccess: invalidateRules });
  const delKb = useMutation({ mutationFn: (id: string) => api(`/admin/ai/knowledge/${id}`, { method: 'DELETE' }), onSuccess: invalidateKb });

  return (
    <div>
      <PageHeader title="Migo AI & Contenido" subtitle="Controle las reglas de triaje del asistente veterinario Migo AI y gestione la base de conocimientos clínicos." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-migo-heading">Reglas de Prompt & Triaje IA</h2>
            <button onClick={() => setShowRule(true)} className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600"><Icon name="plus" className="h-4 w-4" />Nueva Regla</button>
          </div>
          {rules.isLoading ? <Spinner /> : rules.error ? <ErrorNote error={rules.error} /> : (
            <div className="space-y-4">
              {rules.data?.data.length === 0 && <p className="text-sm text-slate-400">Aún no hay reglas. Crea la primera.</p>}
              {rules.data?.data.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-bold text-slate-900"><Icon name="robot" className="h-5 w-5 text-migo-purple" />{r.name}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggle.mutate(r.id)} disabled={toggle.isPending} className={`relative h-6 w-11 rounded-full transition ${r.active ? 'bg-brand-500' : 'bg-slate-300'}`}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${r.active ? 'left-[22px]' : 'left-0.5'}`} />
                      </button>
                      <button onClick={() => { if (confirm(`¿Eliminar la regla "${r.name}"?`)) delRule.mutate(r.id); }} className="rounded-lg p-1 text-slate-300 hover:text-red-500" title="Eliminar"><Icon name="trash" className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Condición de disparo</div>
                  <div className="text-sm text-slate-600">Palabras clave: {r.keywords.map((k) => `'${k}'`).join(', ') || '—'}</div>
                  <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Repositorio de respuesta / template</div>
                  <div className="line-clamp-2 text-sm italic text-slate-500">"{r.responseTemplate}"</div>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge tone={r.active ? 'green' : 'slate'}>{r.active ? 'Activo' : 'Pausado'}</Badge>
                    <Badge tone={r.severity === 'CRITICA' ? 'red' : r.severity === 'BAJA' ? 'green' : 'amber'}>{r.severity}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-migo-heading">Base de Conocimiento Médico</h2>
            <button onClick={() => setShowKb(true)} className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600"><Icon name="plus" className="h-4 w-4" />Agregar Entrada</button>
          </div>
          <div className="relative mb-4">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar toxina, síntoma o alergia…" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-4 text-sm outline-none focus:border-brand-500" />
          </div>
          {kb.isLoading ? <Spinner /> : kb.error ? <ErrorNote error={kb.error} /> : (
            <div className="space-y-3">
              {kb.data?.data.length === 0 && <p className="text-sm text-slate-400">Sin resultados.</p>}
              {kb.data?.data.map((k) => (
                <div key={k.id} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{k.title}</span>
                    <div className="flex items-center gap-2">
                      <Badge tone="slate">{k.category}</Badge>
                      <Badge tone={sevTone[k.severity] ?? 'slate'}>{k.severity}</Badge>
                      <button onClick={() => { if (confirm(`¿Eliminar "${k.title}"?`)) delKb.mutate(k.id); }} className="rounded-lg p-1 text-slate-300 hover:text-red-500" title="Eliminar"><Icon name="trash" className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-500">{k.description}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {showRule && <RuleModal onClose={() => setShowRule(false)} onCreated={() => { invalidateRules(); setShowRule(false); }} />}
      {showKb && <KnowledgeModal onClose={() => setShowKb(false)} onCreated={() => { invalidateKb(); setShowKb(false); }} />}
    </div>
  );
}

function RuleModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState('');
  const [responseTemplate, setTpl] = useState('');
  const [severity, setSeverity] = useState('MODERADA');
  const create = useMutation({
    mutationFn: () => api('/admin/ai/rules', { method: 'POST', body: { name, keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean), responseTemplate, severity } }),
    onSuccess: onCreated,
  });
  return (
    <Modal title="Nueva Regla de Prompt" onClose={onClose}>
      <Field label="Nombre de la regla"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Triaje Digestivo" /></Field>
      <Field label="Palabras clave (separadas por coma)"><input className={inputCls} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="vómito, diarrea, no come" /></Field>
      <Field label="Template de respuesta"><textarea className={`${inputCls} h-24`} value={responseTemplate} onChange={(e) => setTpl(e.target.value)} placeholder="Atención Migo: …" /></Field>
      <Field label="Severidad">
        <select className={inputCls} value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="CRITICA">Crítica</option>
          <option value="MODERADA">Moderada</option>
          <option value="BAJA">Baja</option>
        </select>
      </Field>
      {create.isError && <ErrorNote error={create.error} />}
      <button onClick={() => create.mutate()} disabled={create.isPending || !name || !responseTemplate} className="mt-2 w-full rounded-xl bg-brand-500 py-2.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
        {create.isPending ? 'Creando…' : 'Crear Regla'}
      </button>
    </Modal>
  );
}

function KnowledgeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Toxinas');
  const [severity, setSeverity] = useState('Moderada');
  const [description, setDescription] = useState('');
  const create = useMutation({
    mutationFn: () => api('/admin/ai/knowledge', { method: 'POST', body: { title, category, severity, description } }),
    onSuccess: onCreated,
  });
  return (
    <Modal title="Nueva Entrada de Conocimiento" onClose={onClose}>
      <Field label="Título"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Xilitol (Endulzante)" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoría">
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option>Toxinas</option><option>Síntomas</option><option>Alergias</option>
          </select>
        </Field>
        <Field label="Severidad">
          <select className={inputCls} value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option>Crítica</option><option>Moderada</option><option>Leve</option>
          </select>
        </Field>
      </div>
      <Field label="Descripción"><textarea className={`${inputCls} h-24`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción clínica…" /></Field>
      {create.isError && <ErrorNote error={create.error} />}
      <button onClick={() => create.mutate()} disabled={create.isPending || !title || !description} className="mt-2 w-full rounded-xl bg-brand-500 py-2.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
        {create.isPending ? 'Creando…' : 'Agregar Entrada'}
      </button>
    </Modal>
  );
}
