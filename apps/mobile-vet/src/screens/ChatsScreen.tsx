import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Channel as StreamChannel } from 'stream-chat';
import { useStream } from '../lib/stream';
import { TabIcon } from '../components/TabIcon';
import { cardShadow, colors, radius } from '../theme';

const ago = (d?: Date | null) => {
  if (!d) return '';
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
};

export default function ChatsScreen({ navigation }: { navigation: any }) {
  const { chatClient, ready } = useStream();
  const [channels, setChannels] = useState<StreamChannel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !chatClient?.userID) return;
    let active = true;
    (async () => {
      try {
        const chs = await chatClient.queryChannels(
          { type: 'messaging', members: { $in: [chatClient.userID!] } },
          { last_message_at: -1 },
          { watch: true, state: true },
        );
        if (active) setChannels(chs);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [ready, chatClient]);

  // El "otro" miembro del canal = el cliente (dueño de la mascota)
  const clientOf = (ch: StreamChannel) => {
    const me = chatClient?.userID;
    const members = Object.values(ch.state.members ?? {});
    const other = members.find((m) => m.user?.id !== me);
    return other?.user?.name ?? 'Cliente';
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}><Text style={styles.title}>Chats con Clientes</Text></View>

      <View style={{ paddingHorizontal: 20 }}>
        {!ready || loading ? (
          <Text style={styles.muted}>Cargando conversaciones…</Text>
        ) : channels.length === 0 ? (
          <View style={styles.empty}>
            <TabIcon name="chat" color="#C9BBD3" size={40} />
            <Text style={styles.muted}>Aún no hay conversaciones con clientes.</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {channels.map((ch) => {
              const last = ch.state.messages[ch.state.messages.length - 1];
              const unread = ch.countUnread();
              const name = clientOf(ch);
              return (
                <Pressable
                  key={ch.cid}
                  style={styles.row}
                  onPress={() => navigation.navigate('ChatThread', { channelType: ch.type, channelId: ch.id, clientName: name })}
                >
                  <View style={styles.avatar}><Text style={{ fontSize: 20 }}>👤</Text></View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowTop}>
                      <Text style={styles.clientName} numberOfLines={1}>{name}</Text>
                      <Text style={styles.time}>{ago(last?.created_at ? new Date(last.created_at) : null)}</Text>
                    </View>
                    <Text style={styles.preview} numberOfLines={1}>
                      {last?.text ?? (last?.attachments?.length ? '📎 Adjunto' : 'Sin mensajes aún')}
                    </Text>
                  </View>
                  {unread > 0 && <View style={styles.badge}><Text style={styles.badgeTxt}>{unread}</Text></View>}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  head: { paddingHorizontal: 20, paddingVertical: 14 },
  title: { fontSize: 24, fontWeight: '900', color: colors.text },
  muted: { color: colors.muted, fontSize: 14 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 40, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', marginTop: 10 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, boxShadow: cardShadow },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  clientName: { fontSize: 16, fontWeight: '800', color: colors.text, flex: 1 },
  time: { fontSize: 12, color: colors.muted },
  preview: { fontSize: 14, color: colors.muted, marginTop: 2 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeTxt: { color: colors.white, fontSize: 12, fontWeight: '800' },
});
