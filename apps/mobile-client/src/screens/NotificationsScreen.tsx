import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { BackButton } from '../components/BackButton';
import { TabIcon } from '../components/TabIcon';
import { NOTIFS_KEY, UNREAD_KEY, markAllRead, markRead, notificationTarget, type AppNotification } from '../lib/notifications';
import { cardShadow, colors, radius } from '../theme';

/** "hace 5 min", "hace 3 h", "ayer", "12 nov". */
function ago(iso: string): string {
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  if (h < 48) return 'ayer';
  return d.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' });
}

const ICON: Record<string, string> = { appointment: 'calendar', PET_FOUND: 'paw' };

// Bandeja de la campana del Inicio: avisos de Migo (citas aceptadas/rechazadas, placa QR…).
export default function NotificationsScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const q = useInfiniteQuery({
    queryKey: NOTIFS_KEY,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<{ data: AppNotification[]; nextBefore: string | null; unread: number }>(
        `/notifications${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    getNextPageParam: (last) => last.nextBefore,
  });
  const items = q.data?.pages.flatMap((p) => p.data) ?? [];
  const unread = q.data?.pages[0]?.unread ?? 0;

  const refreshAll = useCallback(() => {
    void qc.invalidateQueries({ queryKey: NOTIFS_KEY });
    void qc.invalidateQueries({ queryKey: UNREAD_KEY });
  }, [qc]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await q.refetch(); void qc.invalidateQueries({ queryKey: UNREAD_KEY }); } finally { setRefreshing(false); }
  };

  const open = (n: AppNotification) => {
    if (!n.readAt) void markRead(n.id).then(refreshAll).catch(() => {});
    const t = notificationTarget(n);
    if (t) navigation.navigate(t.screen, t.params);
  };

  const readAll = () => { void markAllRead().then(refreshAll).catch(() => {}); };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={s.title}>Notificaciones</Text>
        <View style={{ width: 44 }} />
      </View>
      {unread > 0 ? (
        <Pressable style={s.readAll} onPress={readAll} hitSlop={8}>
          <Text style={s.readAllTxt}>Marcar todas como leídas</Text>
        </Pressable>
      ) : null}

      {q.isLoading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : q.isError ? (
        <View style={s.empty}>
          <Text style={s.emptyTxt}>No pudimos cargar tus notificaciones.</Text>
          <Pressable onPress={() => void q.refetch()}><Text style={s.link}>Reintentar</Text></Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 40, gap: 10, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.brand]} tintColor={colors.brand} />}
          onEndReached={() => { if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage(); }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={s.empty}>
              <TabIcon name="bell" color="#C9BBD3" size={40} />
              <Text style={s.emptyTxt}>No tienes notificaciones todavía.</Text>
            </View>
          }
          ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={colors.brand} style={{ marginVertical: 12 }} /> : null}
          renderItem={({ item: n }) => (
            <Pressable style={[s.card, !n.readAt && s.cardUnread]} onPress={() => open(n)}>
              <View style={[s.icon, !n.readAt && s.iconUnread]}>
                <TabIcon name={ICON[n.type ?? ''] ?? 'bell'} color={colors.brand} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.row}>
                  <Text style={[s.nTitle, !n.readAt && s.nTitleUnread]} numberOfLines={2}>{n.title}</Text>
                  {!n.readAt ? <View style={s.dot} /> : null}
                </View>
                <Text style={s.nBody}>{n.body}</Text>
                <Text style={s.nTime}>{ago(n.createdAt)}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.text },
  readAll: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 6 },
  readAllTxt: { color: colors.brand, fontWeight: '700', fontSize: 14 },
  card: { flexDirection: 'row', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, boxShadow: cardShadow },
  cardUnread: { backgroundColor: '#FBF6FD', borderWidth: 1, borderColor: '#E9D5F2' },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F1ECF5', alignItems: 'center', justifyContent: 'center' },
  iconUnread: { backgroundColor: colors.brandLight },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  nTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  nTitleUnread: { fontWeight: '800' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.red, marginTop: 5 },
  nBody: { fontSize: 14, color: colors.muted, marginTop: 3, lineHeight: 19 },
  nTime: { fontSize: 12, color: colors.muted, marginTop: 6 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 60 },
  emptyTxt: { color: colors.muted, fontSize: 15 },
  link: { color: colors.brand, fontWeight: '700', fontSize: 15 },
});
