import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StreamChat } from 'stream-chat';
import {
  Chat,
  Channel,
  ChannelList,
  Window,
  MessageList,
  MessageComposer,
  Thread,
  useCreateChatClient,
  useChannelStateContext,
} from 'stream-chat-react';
import 'stream-chat-react/dist/css/index.css';
import {
  StreamVideo,
  StreamVideoClient,
  StreamCall,
  SpeakerLayout,
  CallControls,
  StreamTheme,
  type Call,
} from '@stream-io/video-react-sdk';
import '@stream-io/video-react-sdk/dist/css/styles.css';
import { api } from '../lib/api';
import { Spinner, ErrorNote } from '../components/ui';
import { Icon } from '../components/Icon';

interface StreamCred { apiKey: string; token: string; userId: string; role: string; clinicUserId: string }

export default function Chats() {
  const cred = useQuery({ queryKey: ['clinic-stream-token'], queryFn: () => api<StreamCred>('/clinic/stream-token') });
  if (cred.isLoading) return <Spinner className="mx-auto mt-16" />;
  if (cred.error || !cred.data) return <ErrorNote error={cred.error ?? 'GetStream no configurado en el servidor.'} />;
  return <ChatInner cred={cred.data} />;
}

function ChatInner({ cred }: { cred: StreamCred }) {
  const chatClient: StreamChat | null = useCreateChatClient({
    apiKey: cred.apiKey,
    tokenOrProvider: cred.token,
    userData: { id: cred.userId },
  });
  const [videoClient, setVideoClient] = useState<StreamVideoClient | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [calling, setCalling] = useState(false);

  useEffect(() => {
    const vc = new StreamVideoClient({ apiKey: cred.apiKey, user: { id: cred.userId }, token: cred.token });
    setVideoClient(vc);
    return () => {
      vc.disconnectUser().catch(() => {});
    };
  }, [cred]);

  if (!chatClient || !videoClient) return <Spinner className="mx-auto mt-16" />;

  // SOLO el admin inicia: crea la sala en el backend (ring al cliente) y el vet se une.
  const startCall = async (ownerId: string, video: boolean) => {
    if (calling) return;
    setCalling(true);
    try {
      const res = await api<{ callId: string }>('/clinic/teleconsults', { method: 'POST', body: { ownerId, video } });
      const call = videoClient.call('default', res.callId);
      await call.join();
      if (!video) await call.camera.disable().catch(() => {});
      setActiveCall(call);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo iniciar la llamada.');
    } finally {
      setCalling(false);
    }
  };

  const endCall = async () => {
    if (activeCall) await activeCall.leave().catch(() => {});
    setActiveCall(null);
  };

  return (
    <StreamVideo client={videoClient}>
      <h1 className="mb-1 text-3xl font-extrabold text-migo-heading">Mensajes</h1>
      <p className="mb-4 text-sm text-slate-500">Conversaciones con los dueños de mascotas de tu sucursal (en tiempo real).</p>

      <div className="str-chat overflow-hidden rounded-card border border-slate-100" style={{ height: 'calc(100vh - 190px)' }}>
        <Chat client={chatClient} theme="str-chat__theme-light">
          <div className="flex h-full">
            <div className="w-80 shrink-0 border-r border-slate-100">
              <ChannelList
                filters={{ type: 'messaging', members: { $in: [cred.userId] } }}
                sort={{ last_message_at: -1 }}
                options={{ state: true, watch: true, presence: true }}
              />
            </div>
            <div className="flex-1">
              <Channel>
                <Window>
                  <VetChannelHeader clinicUserId={cred.userId} calling={calling} onCall={startCall} />
                  <MessageList />
                  <MessageComposer />
                </Window>
                <Thread />
              </Channel>
            </div>
          </div>
        </Chat>
      </div>

      {/* Sala de videollamada (overlay) — solo aparece cuando el admin inicia una llamada */}
      {activeCall && (
        <div className="fixed inset-0 z-50 bg-black">
          <StreamCall call={activeCall}>
            <StreamTheme>
              <SpeakerLayout />
              <CallControls onLeave={endCall} />
            </StreamTheme>
          </StreamCall>
        </div>
      )}
    </StreamVideo>
  );
}

// Cabecera del hilo con los botones de telemedicina — EXCLUSIVOS del admin.
function VetChannelHeader({
  clinicUserId,
  calling,
  onCall,
}: {
  clinicUserId: string;
  calling: boolean;
  onCall: (ownerId: string, video: boolean) => void;
}) {
  const { members } = useChannelStateContext();
  const memberIds = Object.keys(members ?? {});
  const ownerId = memberIds.find((id) => id !== clinicUserId);
  const clientName = (ownerId && members?.[ownerId]?.user?.name) || 'Cliente';
  const online = ownerId ? !!members?.[ownerId]?.user?.online : false;

  return (
    <div className="flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3">
      <div>
        <div className="font-bold text-slate-800">{clientName}</div>
        <div className="text-xs text-slate-500">{online ? 'En línea' : 'Desconectado'}</div>
      </div>
      <div className="flex items-center gap-2">
        <button
          className="flex items-center gap-2 rounded-lg border border-migo-purple px-3 py-2 text-sm font-semibold text-migo-purple hover:bg-violet-50 disabled:opacity-40"
          disabled={!ownerId || calling}
          onClick={() => ownerId && onCall(ownerId, false)}
          title="Iniciar llamada de voz"
        >
          <Icon name="phone" className="h-4 w-4" /> Voz
        </button>
        <button
          className="flex items-center gap-2 rounded-lg bg-migo-purple px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
          disabled={!ownerId || calling}
          onClick={() => ownerId && onCall(ownerId, true)}
          title="Iniciar videollamada"
        >
          <Icon name="camera" className="h-4 w-4" /> {calling ? 'Llamando…' : 'Videollamada'}
        </button>
      </div>
    </div>
  );
}
