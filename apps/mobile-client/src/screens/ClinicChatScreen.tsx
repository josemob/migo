import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Channel as StreamChannel } from 'stream-chat';
import { Channel, MessageList, MessageComposer } from 'stream-chat-expo';
import { api } from '../lib/api';
import { useStream } from '../lib/stream';
import { Loading, Muted } from '../components/ui';
import { BackButton } from '../components/BackButton';
import { cardShadow, colors } from '../theme';

interface ServiceOffer {
  serviceId: string; name: string; category?: string; priceUsd: number; durationMin?: number; clinicId?: string; clinicName?: string;
}

export default function ClinicChatScreen({ navigation, route }: any) {
  const { clinicId, clinicName } = route.params as { clinicId: string; clinicName?: string };
  const { chatClient, ready } = useStream();
  const insets = useSafeAreaInsets();
  const [channel, setChannel] = useState<StreamChannel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [offer, setOffer] = useState<ServiceOffer | null>(null);

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

  return (
    <SafeAreaView style={[styles.safe, { paddingBottom: insets.bottom + 40 }]} edges={['top']}>
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
          hasFilePicker={false}
          hasImagePicker
          hasCameraPicker
          hasCommands={false}
          audioRecordingEnabled={false}
        >
          <MessageList />
          <MessageComposer />
        </Channel>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
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
});
