import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import type { Channel as StreamChannel } from 'stream-chat';
import { Channel, MessageList, MessageComposer } from 'stream-chat-expo';
import { api } from '../lib/api';
import { useStream } from '../lib/stream';
import { appAlert } from '../lib/dialog';
import { Loading, Muted } from '../components/ui';
import { BackButton } from '../components/BackButton';
import { cardShadow, colors } from '../theme';

interface ServiceOffer {
  serviceId: string; name: string; category?: string; priceUsd: number; durationMin?: number; clinicId?: string; clinicName?: string;
}

type PickKind = 'image' | 'camera' | 'video';

export default function ClinicChatScreen({ navigation, route }: any) {
  const { clinicId, clinicName } = route.params as { clinicId: string; clinicName?: string };
  const { chatClient, ready } = useStream();
  const insets = useSafeAreaInsets();
  const [channel, setChannel] = useState<StreamChannel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [offer, setOffer] = useState<ServiceOffer | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Detecta el último "servicio propuesto" por la clínica (mensaje con migo_service)
  useEffect(() => {
    if (!channel) return;
    const scan = () => {
      const msgs = channel.state.messages;
      for (let i = msgs.length - 1; i >= 0; i--) {
        const s = (msgs[i] as unknown as { migo_service?: ServiceOffer }).migo_service;
        if (s) { setOffer(s); return; }
      }
    };
    scan();
    const sub = channel.on('message.new', scan);
    return () => sub?.unsubscribe?.();
  }, [channel]);

  useEffect(() => {
    if (!ready || !chatClient) return;
    let active = true;
    (async () => {
      try {
        const res = await api<{ channel: { type: string; id: string } }>(
          `/me/chats/${clinicId}/stream-channel`,
          { method: 'POST' },
        );
        const ch = chatClient.channel(res.channel.type, res.channel.id);
        await ch.watch();
        if (active) setChannel(ch);
      } catch (e) {
        if (active) setErr(e instanceof Error ? e.message : 'No se pudo abrir el chat.');
      }
    })();
    return () => {
      active = false;
    };
  }, [ready, chatClient, clinicId]);

  const uploadAndSend = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!channel) return;
    const isVideo = asset.type === 'video';
    const name = asset.fileName ?? asset.uri.split('/').pop() ?? `archivo-${isVideo ? 'video.mp4' : 'foto.jpg'}`;
    const type = asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg');
    setUploading(true);
    try {
      const resp = isVideo
        ? await channel.sendFile(asset.uri, name, type)
        : await channel.sendImage(asset.uri, name, type);
      const url = (resp as { file: string }).file;
      await channel.sendMessage({
        attachments: [
          isVideo
            ? { type: 'video', asset_url: url, title: name, mime_type: type }
            : { type: 'image', image_url: url, asset_url: url },
        ],
      });
    } catch (e) {
      appAlert('No se pudo enviar', e instanceof Error ? e.message : 'Intenta de nuevo.');
    } finally {
      setUploading(false);
    }
  };

  const pick = async (kind: PickKind) => {
    setAttachOpen(false);
    try {
      let result: ImagePicker.ImagePickerResult;
      if (kind === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return appAlert('Permiso necesario', 'Habilita el acceso a la cámara para tomar fotos.');
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return appAlert('Permiso necesario', 'Habilita el acceso a tus fotos para adjuntar archivos.');
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: kind === 'video' ? ['videos'] : ['images'],
          quality: 0.7,
        });
      }
      if (result.canceled || !result.assets?.length) return;
      await uploadAndSend(result.assets[0]);
    } catch (e) {
      appAlert('No se pudo adjuntar', e instanceof Error ? e.message : 'Intenta de nuevo.');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topbar}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.topTitle} numberOfLines={1}>{clinicName ?? 'Clínica'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {offer && (
        <Pressable
          style={styles.offer}
          onPress={() =>
            navigation.navigate('BookAppointment', {
              clinicId: offer.clinicId ?? clinicId,
              clinicName: offer.clinicName ?? clinicName ?? 'Clínica',
              service: { id: offer.serviceId, name: offer.name, category: offer.category ?? 'CONSULTATION', priceUsd: offer.priceUsd, durationMin: offer.durationMin ?? 30 },
            })
          }
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.offerLabel}>📋 La clínica te propone un servicio</Text>
            <Text style={styles.offerName}>{offer.name} · ${Number(offer.priceUsd).toFixed(2)}</Text>
          </View>
          <View style={styles.offerBtn}><Text style={styles.offerBtnTxt}>Agendar →</Text></View>
        </Pressable>
      )}

      {err ? (
        <View style={styles.center}><Muted>{err}</Muted></View>
      ) : !channel ? (
        <Loading />
      ) : (
        <Channel
          channel={channel}
          bottomInset={insets.bottom}
          keyboardVerticalOffset={0}
          additionalKeyboardAvoidingViewProps={{ style: { flex: 1 } }}
          handleAttachButtonPress={() => {
            Keyboard.dismiss();
            setAttachOpen((o) => !o);
          }}
          hasFilePicker={false}
          hasImagePicker
          hasCameraPicker={false}
          hasCommands={false}
          audioRecordingEnabled={false}
        >
          <MessageList />
          {attachOpen && (
            <View style={styles.attachRow}>
              <AttachOption icon="image" onPress={() => pick('image')} />
              <AttachOption icon="camera" onPress={() => pick('camera')} />
              <AttachOption icon="video" onPress={() => pick('video')} />
            </View>
          )}
          <MessageComposer />
        </Channel>
      )}

      {uploading && (
        <View style={styles.uploading} pointerEvents="none">
          <View style={styles.uploadingCard}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.uploadingTxt}>Enviando…</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const ATTACH_ICONS: Record<string, string> = {
  image: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z',
  camera: 'M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
  video: 'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z',
};

function AttachOption({ icon, onPress }: { icon: keyof typeof ATTACH_ICONS; onPress: () => void }) {
  return (
    <Pressable style={styles.attachOpt} onPress={onPress} hitSlop={8}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="#334155">
        <Path d={ATTACH_ICONS[icon]} />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white, paddingBottom: 12 },
  topbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  back: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', boxShadow: cardShadow },
  backArrow: { fontSize: 30, color: colors.brand, marginTop: -4, fontWeight: '700' },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 8, padding: 14, backgroundColor: '#FEFBEA', borderRadius: 16, borderWidth: 1.5, borderColor: colors.accent, boxShadow: cardShadow },
  offerLabel: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  offerName: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 2 },
  offerBtn: { backgroundColor: colors.brand, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  offerBtnTxt: { color: colors.white, fontWeight: '800', fontSize: 14 },
  // Fila de opciones de adjuntar: sobre el input, a 14px; fondo del chat para continuidad
  attachRow: { flexDirection: 'row', gap: 16, paddingTop: 12, paddingBottom: 14, paddingHorizontal: 20, backgroundColor: colors.canvas },
  // Iconos gris oscuro en círculos 34x34 con borde gris
  attachOpt: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  uploading: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  uploadingCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 16, boxShadow: cardShadow },
  uploadingTxt: { fontSize: 15, fontWeight: '700', color: colors.text },
});
