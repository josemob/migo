import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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

interface Cred { apiKey: string; token: string; userId: string }

interface StreamCtx {
  chatClient: StreamChat | null;
  ready: boolean;
  unread: number; // total de mensajes sin leer (para el punto rojo del tab)
}
const Ctx = createContext<StreamCtx>({ chatClient: null, ready: false, unread: 0 });
export const useStream = () => useContext(Ctx);

// Fuerza fondo blanco en los chats (message list + composer)
const CHAT_THEME = {
  colors: { white_snow: '#FFFFFF' },
  messageList: { container: { backgroundColor: '#FFFFFF' } },
} as const;

/**
 * Conecta al usuario a GetStream (Chat + Video) usando el token del backend
 * (/me/stream-token, rol customer). Envuelve la app con los providers de Stream
 * y muestra la pantalla de llamada entrante cuando la clínica llama.
 */
export function StreamProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [chatClient, setChatClient] = useState<StreamChat | null>(null);
  const [videoClient, setVideoClient] = useState<StreamVideoClient | null>(null);
  const [unread, setUnread] = useState(0);
  const connecting = useRef(false);

  // Escucha el contador global de no leídos para el punto rojo del tab de Chats.
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
        const cred = await api<Cred>('/me/stream-token');
        const streamUser = { id: cred.userId, name: user.fullName ?? undefined };
        cc = StreamChat.getInstance(cred.apiKey);
        if (!cc.userID) await cc.connectUser(streamUser, cred.token);
        vc = StreamVideoClient.getOrCreateInstance({ apiKey: cred.apiKey, user: streamUser, token: cred.token });
        setChatClient(cc);
        setVideoClient(vc);
      } catch (e) {
        // Stream no configurado / sin red: la app sigue funcionando sin chat en vivo
        console.error('[stream] connect failed:', e instanceof Error ? e.message : e);
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
    return <Ctx.Provider value={{ chatClient, ready: false, unread }}>{children}</Ctx.Provider>;
  }

  return (
    <OverlayProvider value={{ style: CHAT_THEME }}>
      <Chat client={chatClient} style={CHAT_THEME}>
        <StreamVideo client={videoClient}>
          <Ctx.Provider value={{ chatClient, ready: true, unread }}>
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
/** Cierra la llamada de este lado cuando el OTRO cuelga: si hubo un remoto y luego
 *  se va, salimos (call.leave) y el overlay se cierra solo. */
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
  const call = calls[0];
  if (!call) return null;
  return (
    <Modal animationType="slide" transparent={false} statusBarTranslucent>
      {/* SafeAreaProvider propio: dentro de un Modal el del root no aplica, así los
          controles de Stream respetan el margen sobre la barra de navegación. */}
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: colors.brandDeep }}>
          <StreamCall call={call}>
            <AutoHangup />
            <RingingCallContent />
          </StreamCall>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}
