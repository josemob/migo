import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';
import type { Channel as StreamChannel } from 'stream-chat';
import { Channel, MessageList, MessageComposer } from 'stream-chat-expo';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { appAlert } from '../lib/dialog';
import { useStream } from '../lib/stream';
import { Loading } from '../components/ui';
import { BackButton } from '../components/BackButton';
import { cardShadow, colors, radius } from '../theme';

interface Service { id: string; name: string; category: string; priceUsd: string | number; durationMin: number }

export default function ChatThreadScreen({ navigation, route }: any) {
  const { channelType, channelId, clientName } = route.params as { channelType: string; channelId: string; clientName?: string };
  const { user } = useAuth();
  const { chatClient, ready } = useStream();
  const insets = useSafeAreaInsets();
  const [channel, setChannel] = useState<StreamChannel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const services = useQuery({ queryKey: ['clinic-services'], queryFn: () => api<{ data: Service[] }>('/services'), enabled: picker });

  useEffect(() => {
    if (!ready || !chatClient) return;
    let active = true;
    (async () => {
      try {
        const ch = chatClient.channel(channelType, channelId);
        await ch.watch();
        if (active) setChannel(ch);
      } catch (e) {
        if (active) setErr(e instanceof Error ? e.message : 'No se pudo abrir el chat.');
      }
    })();
    return () => { active = false; };
  }, [ready, chatClient, channelId]);

  const sendService = async (s: Service) => {
    if (!channel) return;
    setSending(true);
    try {
      const clinicId = user?.staffProfile?.clinicId;
      const clinicName = user?.staffProfile?.clinic?.name ?? 'la clínica';
      const price = Number(s.priceUsd);
      await channel.sendMessage({
        text: `📋 Te propongo un servicio: ${s.name} — $${price.toFixed(2)}. Toca "Agendar" para elegir día y hora.`,
        migo_service: { serviceId: s.id, name: s.name, category: s.category, priceUsd: price, durationMin: s.durationMin, clinicId, clinicName },
      } as never);
      setPicker(false);
    } catch (e) {
      appAlert('No se pudo enviar', e instanceof Error ? e.message : 'Intenta de nuevo.');
    } finally {
      setSending(false);
    }
  };

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

  const pick = async (kind: 'image' | 'camera' | 'video') => {
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
        <Text style={styles.topTitle} numberOfLines={1}>{clientName ?? 'Cliente'}</Text>
        <Pressable style={styles.svcBtn} onPress={() => setPicker(true)}>
          <Text style={styles.svcBtnTxt}>+ Servicio</Text>
        </Pressable>
      </View>

      {err ? (
        <View style={styles.center}><Text style={styles.muted}>{err}</Text></View>
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

      {/* Selector de servicio */}
      <Modal visible={picker} animationType="slide" transparent onRequestClose={() => setPicker(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPicker(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Enviar servicio a {clientName ?? 'cliente'}</Text>
            <Text style={styles.sheetSub}>El cliente recibirá una tarjeta para agendar día y hora.</Text>
            {services.isLoading ? (
              <Loading />
            ) : (services.data?.data.length ?? 0) === 0 ? (
              <Text style={styles.muted}>No hay servicios en el catálogo.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {services.data!.data.map((s) => (
                  <Pressable key={s.id} style={styles.svcRow} disabled={sending} onPress={() => sendService(s)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.svcName}>{s.name}</Text>
                      <Text style={styles.svcMeta}>{s.category} · {s.durationMin} min</Text>
                    </View>
                    <Text style={styles.svcPrice}>${Number(s.priceUsd).toFixed(2)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <Pressable style={styles.cancel} onPress={() => setPicker(false)}><Text style={styles.cancelTxt}>Cancelar</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  safe: { flex: 1, backgroundColor: colors.canvas, paddingBottom: 12 },
  attachRow: { flexDirection: 'row', gap: 16, paddingTop: 12, paddingBottom: 14, paddingHorizontal: 20, backgroundColor: colors.canvas },
  attachOpt: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  uploading: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  uploadingCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 16, boxShadow: cardShadow },
  uploadingTxt: { fontSize: 15, fontWeight: '700', color: colors.text },
  topbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.text },
  svcBtn: { backgroundColor: colors.brand, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 8 },
  svcBtnTxt: { color: colors.white, fontWeight: '800', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: colors.muted, fontSize: 15 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.canvas, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  sheetSub: { fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: 14 },
  svcRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 10, boxShadow: cardShadow },
  svcName: { fontSize: 15, fontWeight: '800', color: colors.text },
  svcMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  svcPrice: { fontSize: 16, fontWeight: '900', color: colors.brand },
  cancel: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  cancelTxt: { color: colors.muted, fontWeight: '800', fontSize: 15 },
});
