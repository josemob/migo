import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Channel as StreamChannel } from 'stream-chat';
import { Channel, MessageList, MessageComposer } from 'stream-chat-expo';
import { api } from '../lib/api';
import { useStream } from '../lib/stream';
import { Loading, Muted } from '../components/ui';
import { cardShadow, colors } from '../theme';

export default function ClinicChatScreen({ navigation, route }: any) {
  const { clinicId, clinicName } = route.params as { clinicId: string; clinicName?: string };
  const { chatClient, ready } = useStream();
  const insets = useSafeAreaInsets();
  const [channel, setChannel] = useState<StreamChannel | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
        <Pressable style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>{clinicName ?? 'Clínica'}</Text>
        <View style={{ width: 40 }} />
      </View>

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
});
