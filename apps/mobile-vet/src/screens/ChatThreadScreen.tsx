import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Channel as StreamChannel } from 'stream-chat';
import { Channel, MessageList, MessageComposer } from 'stream-chat-expo';
import { useStream } from '../lib/stream';
import { Loading } from '../components/ui';
import { BackButton } from '../components/BackButton';
import { colors } from '../theme';

export default function ChatThreadScreen({ navigation, route }: any) {
  const { channelType, channelId, clientName } = route.params as { channelType: string; channelId: string; clientName?: string };
  const { chatClient, ready } = useStream();
  const insets = useSafeAreaInsets();
  const [channel, setChannel] = useState<StreamChannel | null>(null);
  const [err, setErr] = useState<string | null>(null);

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

  return (
    <SafeAreaView style={[styles.safe, { paddingBottom: insets.bottom + 40 }]} edges={['top']}>
      <View style={styles.topbar}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.topTitle} numberOfLines={1}>{clientName ?? 'Cliente'}</Text>
        <View style={{ width: 44 }} />
      </View>

      {err ? (
        <View style={styles.center}><Text style={styles.muted}>{err}</Text></View>
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
  topTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: colors.muted, fontSize: 15 },
});
