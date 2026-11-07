import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { usePullRefresh } from '../lib/refresh';
import { BackButton } from '../components/BackButton';
import { TabIcon } from '../components/TabIcon';
import { Loading } from '../components/ui';
import { cardShadow, colors, radius, type } from '../theme';

// Historial de consultas (antes "Mis expedientes", solo las últimas 100 y sin buscador):
// búsqueda en el servidor, filtros, agrupado por mes y "Cargar más" de 20 en 20.
// El admin de la sucursal puede ver también las de toda la clínica.

interface Rec {
  id: string;
  visitedAt: string;
  reason?: string | null;
  diagnosis?: string | null;
  signedAt?: string | null;
  signedByName?: string | null;
  pet: { name: string; species?: string; owner?: { fullName: string } | null };
  vet?: { user: { fullName: string } } | null;
}
interface Page { data: Rec[]; nextOffset: number | null; canSeeClinic: boolean }

type Signed = 'all' | 'signed' | 'unsigned';
type Period = 'month' | '3m' | 'all';
type Scope = 'mine' | 'clinic';

const SIGNED: { key: Signed; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'unsigned', label: 'Sin firmar' },
  { key: 'signed', label: 'Firmadas' },
];
const PERIOD: { key: Period; label: string }[] = [
  { key: 'month', label: 'Este mes' },
  { key: '3m', label: '3 meses' },
  { key: 'all', label: 'Todo' },
];

const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
const monthLabel = (iso: string) => {
  const s = new Date(iso).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export default function HistoryScreen({ navigation }: { navigation: any }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [signed, setSigned] = useState<Signed>('all');
  const [period, setPeriod] = useState<Period>('all');
  const [scope, setScope] = useState<Scope>('mine');

  // Espera a que el vet deje de escribir antes de consultar al servidor.
  useEffect(() => {
    const t = setTimeout(() => setSearch(text.trim()), 350);
    return () => clearTimeout(t);
  }, [text]);

  const q = useInfiniteQuery({
    queryKey: ['my-records', search, signed, period, scope],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ signed, period, scope, offset: String(pageParam) });
      if (search.length >= 2) p.set('search', search);
      return api<Page>(`/patients/records/history?${p.toString()}`);
    },
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const refreshControl = usePullRefresh(() => q.refetch());

  const sign = useMutation({
    mutationFn: (id: string) => api(`/patients/records/${id}/sign`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-records'] });
      appAlert('Expediente firmado', 'Quedó firmado con tu nombre y colegiado.');
    },
    onError: (e) => appAlert('No se pudo firmar', e instanceof Error ? e.message : 'Intenta de nuevo.'),
  });
  const confirmSign = (r: Rec) =>
    appAlert('Firmar expediente', `¿Firmar el expediente de ${r.pet.name}? Quedará firmado con tu nombre y colegiado.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Firmar', onPress: () => sign.mutate(r.id) },
    ]);

  const recs = q.data?.pages.flatMap((p) => p.data) ?? [];
  const canSeeClinic = q.data?.pages[0]?.canSeeClinic ?? false;
  // Grupos por mes, en el orden en que llegan (más recientes primero)
  const groups: { title: string; items: Rec[] }[] = [];
  for (const r of recs) {
    const title = monthLabel(r.visitedAt);
    const g = groups[groups.length - 1];
    if (g && g.title === title) g.items.push(r);
    else groups.push({ title, items: [r] });
  }
  const filtering = search.length >= 2 || signed !== 'all' || period !== 'all';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Historial de consultas</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        <View style={styles.searchBox}>
          <TabIcon name="search" color={colors.muted} size={18} />
          <TextInput
            style={styles.searchInput}
            placeholder="Mascota, dueño, cédula, motivo o diagnóstico…"
            placeholderTextColor={colors.muted}
            value={text}
            onChangeText={setText}
            autoCorrect={false}
            returnKeyType="search"
          />
          {text ? (
            <Pressable hitSlop={8} onPress={() => setText('')}><Text style={styles.clear}>✕</Text></Pressable>
          ) : null}
        </View>
        {canSeeClinic && (
          <View style={styles.segs}>
            {(['mine', 'clinic'] as Scope[]).map((s) => (
              <Pressable key={s} style={[styles.seg, scope === s && styles.segOn]} onPress={() => setScope(s)}>
                <Text style={[styles.segTxt, scope === s && styles.segTxtOn]}>{s === 'mine' ? 'Mis consultas' : 'Toda la clínica'}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0, flexShrink: 0 }}>
          {SIGNED.map((f) => (
            <Pressable key={f.key} style={[styles.chip, signed === f.key && styles.chipOn]} onPress={() => setSigned(f.key)}>
              <Text style={[styles.chipTxt, signed === f.key && styles.chipTxtOn]}>{f.label}</Text>
            </Pressable>
          ))}
          <View style={styles.sep} />
          {PERIOD.map((f) => (
            <Pressable key={f.key} style={[styles.chip, period === f.key && styles.chipOn]} onPress={() => setPeriod(f.key)}>
              <Text style={[styles.chipTxt, period === f.key && styles.chipTxtOn]}>{f.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 12, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
      >
        {q.isLoading ? (
          <Loading />
        ) : q.isError ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTxt}>No pudimos cargar el historial.</Text>
            <Text style={styles.emptyHint}>Revisa tu conexión e intenta de nuevo.</Text>
            <Pressable onPress={() => void q.refetch()}><Text style={styles.link}>Reintentar →</Text></Pressable>
          </View>
        ) : recs.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTxt}>{filtering ? 'Ninguna consulta coincide.' : 'Aún no hay consultas.'}</Text>
            <Text style={styles.emptyHint}>
              {filtering ? 'Prueba con otra palabra o cambia los filtros.' : 'Al atender una consulta o urgencia, el expediente aparecerá aquí.'}
            </Text>
          </View>
        ) : (
          <>
            {groups.map((g) => (
              <View key={g.title} style={{ gap: 12 }}>
                <Text style={styles.month}>{g.title}</Text>
                {g.items.map((r) => (
                  <Pressable key={r.id} style={styles.card} onPress={() => navigation.navigate('RecordDetail', { id: r.id })}>
                    <View style={styles.cardTop}>
                      <Text style={styles.pet} numberOfLines={1}>{r.pet.name}</Text>
                      {r.signedAt ? (
                        <View style={[styles.pill, { backgroundColor: '#DFF3E6' }]}><Text style={[styles.pillTxt, { color: colors.green }]}>✓ Firmado</Text></View>
                      ) : (
                        <View style={[styles.pill, { backgroundColor: '#FEF4E0' }]}><Text style={[styles.pillTxt, { color: colors.amber }]}>Sin firmar</Text></View>
                      )}
                    </View>
                    <Text style={styles.meta} numberOfLines={1}>
                      {fmt(r.visitedAt)} · Dueño: {r.pet.owner?.fullName ?? '—'}
                    </Text>
                    <Text style={styles.reason} numberOfLines={1}>{r.reason ?? 'Consulta'}</Text>
                    {r.diagnosis ? <Text style={styles.dx} numberOfLines={2}>Dx: {r.diagnosis}</Text> : null}
                    {scope === 'clinic' && (r.vet?.user.fullName || r.signedByName) ? (
                      <Text style={styles.meta}>Atendió: {r.vet?.user.fullName ?? r.signedByName}</Text>
                    ) : null}
                    {!r.signedAt && scope === 'mine' && (
                      <Pressable style={[styles.signBtn, sign.isPending && { opacity: 0.6 }]} disabled={sign.isPending} onPress={() => confirmSign(r)}>
                        <Text style={styles.signTxt}>✍️ Firmar expediente</Text>
                      </Pressable>
                    )}
                  </Pressable>
                ))}
              </View>
            ))}
            {q.hasNextPage && (
              <Pressable style={styles.more} disabled={q.isFetchingNextPage} onPress={() => void q.fetchNextPage()}>
                {q.isFetchingNextPage ? <ActivityIndicator color={colors.brand} /> : <Text style={styles.link}>Cargar más</Text>}
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.text },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, padding: 0 },
  clear: { color: colors.muted, fontSize: 16, fontWeight: '700' },
  segs: { flexDirection: 'row', gap: 8 },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  segOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  segTxt: { ...type.bodySmall, fontWeight: '700', color: colors.muted },
  segTxtOn: { color: colors.white },
  chips: { gap: 8, paddingBottom: 8, alignItems: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.brandLight, borderColor: colors.brand },
  chipTxt: { ...type.bodySmall, fontWeight: '700', color: colors.muted },
  chipTxtOn: { color: colors.brand },
  sep: { width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 4 },

  month: { fontSize: 14, fontWeight: '800', color: colors.muted, marginTop: 4 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, gap: 4, boxShadow: cardShadow },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pet: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
  pill: { borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  pillTxt: { fontSize: 12, fontWeight: '800' },
  meta: { fontSize: 13, color: colors.muted },
  reason: { fontSize: 14, color: colors.text, fontWeight: '600' },
  dx: { fontSize: 14, color: colors.text },
  signBtn: { marginTop: 8, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.brand },
  signTxt: { color: colors.white, fontWeight: '800', fontSize: 14 },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 40, paddingHorizontal: 24 },
  emptyTxt: { fontSize: 15, fontWeight: '800', color: colors.text },
  emptyHint: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  link: { color: colors.brand, fontWeight: '800', fontSize: 15 },
  more: { alignItems: 'center', paddingVertical: 14 },
});
