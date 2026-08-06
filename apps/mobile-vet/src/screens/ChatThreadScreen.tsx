import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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

  return (
    <SafeAreaView style={[styles.safe, { paddingBottom: insets.bottom + 40 }]} edges={['top']}>
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
        <Channel channel={channel} bottomInset={insets.bottom} hasFilePicker={false} hasImagePicker hasCameraPicker hasCommands={false} audioRecordingEnabled={false}>
          <MessageList />
          <MessageComposer />
        </Channel>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
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
