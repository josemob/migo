import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StreamChat } from 'stream-chat';
import { Chat, OverlayProvider } from 'stream-chat-expo';
import {
  StreamVideo,
  StreamVideoClient,
  StreamCall,
  RingingCallContent,
  useCalls,
  useCall,
  useCallStateHooks,
} from '@stream-io/video-react-native-sdk';
import { api } from './api';
import { useAuth } from './auth';
import { colors } from '../theme';

interface Cred { apiKey: string; token: string; userId: string; clinicUserId?: string }

interface StreamCtx {
  chatClient: StreamChat | null;
  videoClient: StreamVideoClient | null; // para anillar llamadas DESDE el cliente
  streamUserId: string | null; // identidad Stream de la clínica (clinic_<id>)
  ready: boolean;
  unread: number; // total de mensajes sin leer (punto rojo del tab de Chats)
}
const Ctx = createContext<StreamCtx>({ chatClient: null, videoClient: null, streamUserId: null, ready: false, unread: 0 });
export const useStream = () => useContext(Ctx);

/**
 * Conecta al usuario a GetStream (Chat + Video) usando el token del backend
 * (/me/stream-token, rol customer). Envuelve la app con los providers de Stream
 * y muestra la pantalla de llamada entrante cuando la clínica llama.
 */
export function StreamProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [chatClient, setChatClient] = useState<StreamChat | null>(null);
  const [videoClient, setVideoClient] = useState<StreamVideoClient | null>(null);
  const [streamUserId, setStreamUserId] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const connecting = useRef(false);

  // Contador global de no leídos para el punto rojo del tab de Chats.
  useEffect(() => {
    if (!chatClient?.userID) return;
    setUnread((chatClient.user as { total_unread_count?: number } | undefined)?.total_unread_count ?? 0);
    const sub = chatClient.on((e) => {
      if (typeof e.total_unread_count === 'number') setUnread(e.total_unread_count);
    });
    return () => sub.unsubscribe();
  }, [chatClient]);

  useEffect(() => {
    if (!user || connecting.current) return;
    connecting.current = true;
    let cc: StreamChat | null = null;
    let vc: StreamVideoClient | null = null;

    (async () => {
      try {
        // El staff se conecta a Stream como la IDENTIDAD DE LA CLÍNICA (clinic_<clinicId>)
        const cred = await api<Cred>('/clinic/stream-token');
        const streamUser = { id: cred.userId, name: user.staffProfile?.clinic?.name ?? 'Clínica' };
        cc = StreamChat.getInstance(cred.apiKey);
        if (!cc.userID) await cc.connectUser(streamUser, cred.token);
        vc = StreamVideoClient.getOrCreateInstance({ apiKey: cred.apiKey, user: streamUser, token: cred.token });
        setChatClient(cc);
        setVideoClient(vc);
        setStreamUserId(cred.userId);
      } catch {
        // Stream no configurado / sin red: la app sigue funcionando sin chat en vivo
        connecting.current = false;
      }
    })();

    return () => {
      cc?.disconnectUser().catch(() => {});
      vc?.disconnectUser().catch(() => {});
      setChatClient(null);
      setVideoClient(null);
      connecting.current = false;
    };
  }, [user]);

  // Aún sin conectar: renderiza los hijos (las pantallas de chat muestran su propia carga)
  if (!chatClient || !videoClient) {
    return <Ctx.Provider value={{ chatClient, videoClient, streamUserId, ready: false, unread }}>{children}</Ctx.Provider>;
  }

  return (
    <OverlayProvider>
      <Chat client={chatClient}>
        <StreamVideo client={videoClient}>
          <Ctx.Provider value={{ chatClient, videoClient, streamUserId, ready: true, unread }}>
            {children}
            <IncomingCallOverlay />
          </Ctx.Provider>
        </StreamVideo>
      </Chat>
    </OverlayProvider>
  );
}

/**
 * El cliente NO inicia llamadas; solo las recibe. Cuando la clínica llama, el SDK
 * de Video pobla useCalls() y aquí mostramos la pantalla de "Llamada entrante"
 * (aceptar/rechazar) que RingingCallContent maneja de forma nativa.
 */
/** Cierra la llamada de este lado cuando el OTRO participante cuelga: si hubo un
 *  remoto y luego se va, salimos (call.leave) y el overlay se cierra solo. */
function AutoHangup() {
  const call = useCall();
  const { useRemoteParticipants } = useCallStateHooks();
  const remote = useRemoteParticipants();
  const hadRemote = useRef(false);
  useEffect(() => {
    if (remote.length > 0) hadRemote.current = true;
    else if (hadRemote.current) call?.leave().catch(() => {});
  }, [remote.length, call]);
  return null;
}

function IncomingCallOverlay() {
  const calls = useCalls();
  const insets = useSafeAreaInsets();
  const call = calls[0];
  if (!call) return null;
  return (
    <Modal animationType="slide" transparent={false} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.brandDeep, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <StreamCall call={call}>
          <AutoHangup />
          <RingingCallContent />
        </StreamCall>
      </View>
    </Modal>
  );
}
