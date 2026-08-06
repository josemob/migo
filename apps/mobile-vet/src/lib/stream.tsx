import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, View } from 'react-native';
import { StreamChat } from 'stream-chat';
import { Chat, OverlayProvider } from 'stream-chat-expo';
import {
  StreamVideo,
  StreamVideoClient,
  StreamCall,
  RingingCallContent,
  useCalls,
} from '@stream-io/video-react-native-sdk';
import { api } from './api';
import { useAuth } from './auth';
import { colors } from '../theme';

interface Cred { apiKey: string; token: string; userId: string }

interface StreamCtx {
  chatClient: StreamChat | null;
  ready: boolean;
}
const Ctx = createContext<StreamCtx>({ chatClient: null, ready: false });
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
  const connecting = useRef(false);

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
    return <Ctx.Provider value={{ chatClient, ready: false }}>{children}</Ctx.Provider>;
  }

  return (
    <OverlayProvider>
      <Chat client={chatClient}>
        <StreamVideo client={videoClient}>
          <Ctx.Provider value={{ chatClient, ready: true }}>
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
function IncomingCallOverlay() {
  const calls = useCalls();
  const call = calls[0];
  if (!call) return null;
  return (
    <Modal animationType="slide" transparent={false} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.brandDeep }}>
        <StreamCall call={call}>
          <RingingCallContent />
        </StreamCall>
      </View>
    </Modal>
  );
}
