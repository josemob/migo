import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Card, ErrorNote, PageHeader, SectionTitle, Spinner } from '../components/ui';

interface Rule { id: string; name: string; keywords: string[]; responseTemplate: string; severity: string; active: boolean }
interface Knowledge { id: string; title: string; category: string; severity: string; description: string }

const sevTone: Record<string, string> = { Crítica: 'red', Moderada: 'amber', Leve: 'green' };

export default function MigoAI() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const rules = useQuery({ queryKey: ['admin-ai-rules'], queryFn: () => api<{ data: Rule[] }>('/admin/ai/rules') });
  const kb = useQuery({ queryKey: ['admin-ai-kb', q], queryFn: () => api<{ data: Knowledge[] }>(`/admin/ai/knowledge${q ? `?q=${encodeURIComponent(q)}` : ''}`) });

  const toggle = useMutation({
    mutationFn: (id: string) => api(`/admin/ai/rules/${id}/toggle`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-ai-rules'] }),
  });

  return (
    <div>
      <PageHeader title="Migo AI & Contenido" subtitle="Controle las reglas de triaje del asistente veterinario Migo AI y gestione la base de conocimientos clínicos." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Reglas de Prompt & Triaje IA</SectionTitle>
          {rules.isLoading ? <Spinner /> : rules.error ? <ErrorNote error={rules.error} /> : (
            <div className="space-y-4">
              {rules.data?.data.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-bold text-slate-900">🤖 {r.name}</span>
                    <button
                      onClick={() => toggle.mutate(r.id)}
                      disabled={toggle.isPending}
                      className={`relative h-6 w-11 rounded-full transition ${r.active ? 'bg-brand-500' : 'bg-slate-300'}`}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${r.active ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                  </div>
                  <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Condición de disparo</div>
                  <div className="text-sm text-slate-600">Palabras clave: {r.keywords.map((k) => `'${k}'`).join(', ')}</div>
                  <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Repositorio de respuesta / template</div>
                  <div className="line-clamp-2 text-sm italic text-slate-500">"{r.responseTemplate}"</div>
                  <div className="mt-2"><Badge tone={r.active ? 'green' : 'slate'}>{r.active ? 'Activo' : 'Pausado'}</Badge></div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle>Base de Conocimiento Médico</SectionTitle>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Buscar toxina, síntoma o alergia…" className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-brand-500" />
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
                    </div>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-500">{k.description}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
