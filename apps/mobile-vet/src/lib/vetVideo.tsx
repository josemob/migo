import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
interface VideoCtx { client: StreamVideoClient | null; userId: string | null }

const Ctx = createContext<VideoCtx>({ client: null, userId: null });
export const useVetVideo = () => useContext(Ctx);

/**
 * Conecta al vet INDEPENDIENTE a GetStream Video con su propia identidad
 * (/me/stream-token) y muestra la pantalla de llamada (saliente/entrante) cuando hay
 * una teleconsulta activa. El video de la clínica usa otra identidad (clinic_<id>).
 */
export function IndependentVideoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const connecting = useRef(false);

  useEffect(() => {
    if (!user || connecting.current) return;
    connecting.current = true;
    let vc: StreamVideoClient | null = null;
    (async () => {
      try {
        const cred = await api<Cred>('/me/stream-token');
        vc = StreamVideoClient.getOrCreateInstance({
          apiKey: cred.apiKey,
          user: { id: cred.userId, name: user.fullName ?? undefined },
          token: cred.token,
        });
        setClient(vc);
        setUserId(cred.userId);
      } catch {
        // Sin Stream / sin red: el panel sigue funcionando sin video en vivo.
        connecting.current = false;
      }
    })();
    return () => {
      vc?.disconnectUser().catch(() => {});
      setClient(null);
      setUserId(null);
      connecting.current = false;
    };
  }, [user]);

  if (!client) {
    return <Ctx.Provider value={{ client: null, userId: null }}>{children}</Ctx.Provider>;
  }

  return (
    <StreamVideo client={client}>
      <Ctx.Provider value={{ client, userId }}>
        {children}
        <CallOverlay />
      </Ctx.Provider>
    </StreamVideo>
  );
}

/** Cierra la llamada de este lado cuando el OTRO cuelga. */
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

/** Cuando hay una llamada activa, la muestra a pantalla completa (aceptar/colgar nativos). */
function CallOverlay() {
  const calls = useCalls();
  const insets = useSafeAreaInsets();
  const call = calls[0];
  if (!call) return null;
  const padBottom = Math.max(insets.bottom, 44);
  return (
    <Modal animationType="slide" transparent={false} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.brandDeep, paddingTop: Math.max(insets.top, 8), paddingBottom: padBottom }}>
        <StreamCall call={call}>
          <AutoHangup />
          <RingingCallContent />
        </StreamCall>
      </View>
    </Modal>
  );
}
