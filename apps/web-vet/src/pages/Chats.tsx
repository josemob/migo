import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Spinner } from '../components/ui';
import { Icon } from '../components/Icon';

interface Owner { id: string; fullName: string; avatarUrl?: string | null; phone?: string | null }
interface Convo { ownerId: string; owner: Owner; lastMessage: string; lastSender: 'OWNER' | 'CLINIC' | 'SYSTEM'; lastAt: string }
interface Msg { id: string; sender: 'OWNER' | 'CLINIC' | 'SYSTEM'; text: string; createdAt: string }
interface Pet { name: string; species: string; breed?: string | null }
interface Thread { owner: Owner; pets: Pet[]; messages: Msg[] }

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit', hour12: true });
const initials = (name: string) => name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

export default function Chats() {
  const qc = useQueryClient();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  const convos = useQuery({
    queryKey: ['clinic-chats'],
    queryFn: () => api<{ data: Convo[] }>('/clinic/chats'),
    refetchInterval: 5000,
  });

  const thread = useQuery({
    queryKey: ['clinic-chat', ownerId],
    queryFn: () => api<Thread>(`/clinic/chats/${ownerId}`),
    enabled: !!ownerId,
    refetchInterval: 4000,
  });

  // Selecciona la primera conversación al cargar
  useEffect(() => {
    if (!ownerId && convos.data?.data.length) setOwnerId(convos.data.data[0].ownerId);
  }, [convos.data, ownerId]);

  // Auto-scroll al final cuando llegan mensajes
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [thread.data?.messages.length]);

  const send = useMutation({
    mutationFn: (body: string) => api(`/clinic/chats/${ownerId}/messages`, { method: 'POST', body: { text: body } }),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['clinic-chat', ownerId] });
      qc.invalidateQueries({ queryKey: ['clinic-chats'] });
    },
  });

  const list = convos.data?.data ?? [];

  return (
    <div>
      <h1 className="mb-1 text-3xl font-extrabold text-migo-heading">Mensajes</h1>
      <p className="mb-6 text-sm text-slate-500">Conversaciones con los dueños de mascotas de tu sucursal.</p>

      <div className="flex h-[calc(100vh-220px)] gap-5">
        {/* Lista de conversaciones */}
        <div className="flex w-80 shrink-0 flex-col overflow-hidden rounded-card border border-slate-100 bg-white">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
            Conversaciones {list.length > 0 && <span className="text-slate-400">({list.length})</span>}
          </div>
          <div className="flex-1 overflow-y-auto">
            {convos.isLoading ? (
              <Spinner className="mx-auto mt-8" />
            ) : list.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">Aún no hay mensajes de clientes.</div>
            ) : (
              list.map((c) => (
                <button
                  key={c.ownerId}
                  onClick={() => setOwnerId(c.ownerId)}
                  className={`flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50 ${
                    ownerId === c.ownerId ? 'bg-violet-50' : ''
                  }`}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-migo-purple text-sm font-bold text-white">
                    {initials(c.owner.fullName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-slate-800">{c.owner.fullName}</span>
                      <span className="shrink-0 text-[11px] text-slate-400">{time(c.lastAt)}</span>
                    </div>
                    <div className="truncate text-sm text-slate-500">
                      {c.lastSender === 'CLINIC' ? 'Tú: ' : ''}
                      {c.lastMessage}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Hilo */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-card border border-slate-100 bg-white">
          {!ownerId ? (
            <div className="flex flex-1 flex-col items-center justify-center text-slate-400">
              <Icon name="chat" className="mb-2 h-12 w-12" />
              Selecciona una conversación
            </div>
          ) : (
            <>
              {/* Cabecera del hilo */}
              <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-migo-purple text-sm font-bold text-white">
                  {initials(thread.data?.owner.fullName ?? '?')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-800">{thread.data?.owner.fullName ?? 'Cliente'}</div>
                  <div className="truncate text-xs text-slate-500">
                    {thread.data?.pets.length
                      ? thread.data.pets.map((p) => `${p.name}${p.breed ? ` (${p.breed})` : ''}`).join(' · ')
                      : 'Sin mascotas registradas'}
                    {thread.data?.owner.phone ? `  ·  ${thread.data.owner.phone}` : ''}
                  </div>
                </div>
              </div>

              {/* Mensajes */}
              <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-5">
                {thread.isLoading ? (
                  <Spinner className="mx-auto mt-8" />
                ) : (
                  thread.data?.messages.map((m) => {
                    const mine = m.sender === 'CLINIC';
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                            mine ? 'rounded-tr-sm bg-migo-purple text-white' : 'rounded-tl-sm bg-white text-slate-800 shadow-sm'
                          }`}
                        >
                          <div className="text-sm leading-relaxed">{m.text}</div>
                          <div className={`mt-1 text-[10px] ${mine ? 'text-violet-200' : 'text-slate-400'}`}>{time(m.createdAt)}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Entrada */}
              <form
                className="flex items-center gap-3 border-t border-slate-100 px-4 py-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text.trim() && !send.isPending) send.mutate(text.trim());
                }}
              >
                <input
                  className="input flex-1"
                  placeholder="Escribe una respuesta al cliente…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <button type="submit" className="btn-primary" disabled={!text.trim() || send.isPending}>
                  <Icon name="send" className="h-4 w-4" /> Enviar
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
