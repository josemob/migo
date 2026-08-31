import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Channel as StreamChannel } from 'stream-chat';
import { useStream } from '../lib/stream';
import { appAlert } from '../lib/dialog';
import { Card, Muted, Screen } from '../components/ui';
import { TabIcon } from '../components/TabIcon';
import { colors, radius } from '../theme';

const ago = (d?: Date | null) => {
  if (!d) return '';
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
};

export default function ChatsScreen({ navigation, route }: { navigation: any; route?: any }) {
  const { chatClient, ready } = useStream();
  const [channels, setChannels] = useState<StreamChannel[]>([]);
  const [loading, setLoading] = useState(true);
  // Modo "compartir": llega una consulta de Migo IA para enviar a una clínica.
  const shareText: string | undefined = route?.params?.shareText;

  // Abre la conversación con la clínica; en modo compartir, primero envía la consulta.
  const openChannel = async (ch: StreamChannel, clinicId?: string, clinicName?: string) => {
    if (shareText) {
      try {
        await ch.sendMessage({ text: shareText });
        navigation.setParams({ shareText: undefined });
        appAlert('Consulta compartida', `Tu consulta de Migo IA se envió a ${clinicName ?? 'la clínica'}.`);
      } catch {
        appAlert('No se pudo compartir', 'Intenta de nuevo en un momento.');
        return;
      }
    }
    navigation.navigate('ClinicChat', { clinicId, clinicName });
  };

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
    return () => {
      active = false;
    };
  }, [ready, chatClient]);

  return (
    <Screen>
      <Text style={styles.title}>Chats</Text>

      {shareText ? (
        <View style={styles.shareBanner}>
          <Text style={styles.shareBannerText}>📤 Elige una clínica para compartir tu consulta de Migo IA.</Text>
          <Pressable onPress={() => navigation.setParams({ shareText: undefined })}>
            <Text style={styles.shareCancel}>Cancelar</Text>
          </Pressable>
        </View>
      ) : (
        /* Migo IA */
        <Pressable onPress={() => navigation.navigate('AiChat')}>
          <Card style={styles.migoCard}>
            <View style={[styles.icon, { backgroundColor: colors.brand }]}>
              <TabIcon name="medical" color={colors.white} size={24} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Migo IA</Text>
              <Muted>Asistente veterinario · orientación al instante</Muted>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Card>
        </Pressable>
      )}

      <Text style={styles.section}>Conversaciones con clínicas</Text>
      {!ready || loading ? (
        <Muted>Cargando conversaciones…</Muted>
      ) : channels.length === 0 ? (
        <View style={styles.empty}>
          <TabIcon name="chat" color="#C9BBD3" size={40} />
          <Muted>Aún no tienes chats con clínicas.</Muted>
          <Pressable onPress={() => navigation.navigate('Directorio')}>
            <Text style={styles.link}>Explorar el directorio →</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {channels.map((ch) => {
            const data = ch.data as { name?: string; image?: string; migo_clinic_id?: string } | undefined;
            const last = ch.state.messages[ch.state.messages.length - 1];
            const unread = ch.countUnread();
            return (
              <Pressable
                key={ch.cid}
                onPress={() => openChannel(ch, data?.migo_clinic_id, data?.name)}
              >
                <Card style={styles.row}>
                  {data?.image ? (
                    <Image source={{ uri: data.image }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPh]}>
                      <TabIcon name="medical" color={colors.brand} size={22} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowTop}>
                      <Text style={styles.clinicName} numberOfLines={1}>{data?.name ?? 'Clínica'}</Text>
                      <Text style={styles.time}>{ago(last?.created_at ? new Date(last.created_at) : null)}</Text>
                    </View>
                    <Text style={styles.preview} numberOfLines={1}>
                      {last?.text ?? (last?.attachments?.length ? '📎 Adjunto' : 'Sin mensajes aún')}
                    </Text>
                  </View>
                  {unread > 0 && (
                    <View style={styles.badge}><Text style={styles.badgeText}>{unread}</Text></View>
                  )}
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  migoCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  chevron: { fontSize: 26, color: colors.muted },
  section: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 8 },
  shareBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: colors.brandLight, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 12 },
  shareBannerText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.brand },
  shareCancel: { fontSize: 13, fontWeight: '800', color: colors.muted },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 36, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  link: { color: colors.brand, fontWeight: '700', marginTop: 2 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 50, height: 50, borderRadius: 14, backgroundColor: colors.brandLight },
  avatarPh: { alignItems: 'center', justifyContent: 'center' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  clinicName: { fontSize: 16, fontWeight: '800', color: colors.text, flex: 1 },
  time: { fontSize: 12, color: colors.muted },
  preview: { fontSize: 14, color: colors.muted, marginTop: 2 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: colors.white, fontSize: 12, fontWeight: '800' },
});
