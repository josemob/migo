import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Loading } from '../components/ui';
import { TabIcon } from '../components/TabIcon';
import { BackButton } from '../components/BackButton';
import { cardShadow, colors, radius } from '../theme';

interface Vax {
  id: string;
  vaccineName: string;
  appliedAt: string;
  nextDueAt?: string | null;
  lotNumber?: string | null;
  clinic?: { name: string } | null;
}
interface Ficha { name: string; species: string; vaccinations: Vax[] }

const DAY = 86_400_000;
const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function statusOf(nextDueAt?: string | null) {
  if (!nextDueAt) return { label: 'Aplicada', color: colors.muted, bg: '#ECECEF' };
  const due = new Date(nextDueAt).getTime();
  const now = Date.now();
  if (due < now) return { label: 'Vencida', color: colors.red, bg: '#FDECEC' };
  if (due < now + 30 * DAY) return { label: 'Próxima', color: colors.amber, bg: '#FEF4E0' };
  return { label: 'Al día', color: colors.green, bg: '#DFF3E6' };
}

export default function VaccineCardScreen({ route, navigation }: { route: any; navigation: any }) {
  const { id, name } = route.params as { id: string; name?: string };
  const { data, isLoading } = useQuery({ queryKey: ['pet', id], queryFn: () => api<Ficha>(`/me/pets/${id}`) });

  const vax = data?.vaccinations ?? [];
  const vencidas = vax.filter((v) => v.nextDueAt && new Date(v.nextDueAt).getTime() < Date.now()).length;
  const proximas = vax.filter((v) => {
    if (!v.nextDueAt) return false;
    const d = new Date(v.nextDueAt).getTime();
    return d >= Date.now() && d < Date.now() + 30 * DAY;
  }).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topbar}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.topTitle}>Cartilla de vacunación</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading || !data ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {/* Encabezado tipo carnet */}
          <View style={styles.hero}>
            <View style={styles.heroIcon}><TabIcon name="syringe" color={colors.white} size={26} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroPet}>{name ?? data.name}</Text>
              <Text style={styles.heroSub}>{vax.length} vacuna{vax.length === 1 ? '' : 's'} registrada{vax.length === 1 ? '' : 's'}</Text>
            </View>
          </View>

          {(vencidas > 0 || proximas > 0) && (
            <View style={styles.alerts}>
              {vencidas > 0 && <View style={[styles.chip, { backgroundColor: '#FDECEC' }]}><Text style={[styles.chipTxt, { color: colors.red }]}>⚠️ {vencidas} vencida{vencidas === 1 ? '' : 's'}</Text></View>}
              {proximas > 0 && <View style={[styles.chip, { backgroundColor: '#FEF4E0' }]}><Text style={[styles.chipTxt, { color: colors.amber }]}>⏰ {proximas} por vencer</Text></View>}
            </View>
          )}

          {vax.length === 0 ? (
            <View style={styles.empty}>
              <TabIcon name="syringe" color="#C9BBD3" size={40} />
              <Text style={styles.emptyTxt}>Aún no hay vacunas registradas.</Text>
              <Text style={styles.emptyHint}>Tu veterinario las irá agregando cuando atienda a {name ?? data.name}.</Text>
            </View>
          ) : (
            vax.map((v) => {
              const s = statusOf(v.nextDueAt);
              return (
                <View key={v.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.vaxName}>{v.vaccineName}</Text>
                    <View style={[styles.status, { backgroundColor: s.bg }]}><Text style={[styles.statusTxt, { color: s.color }]}>{s.label}</Text></View>
                  </View>
                  <View style={styles.dates}>
                    <View style={styles.dateBox}>
                      <Text style={styles.dateLabel}>Aplicada</Text>
                      <Text style={styles.dateVal}>{fmt(v.appliedAt)}</Text>
                    </View>
                    <View style={styles.dateBox}>
                      <Text style={styles.dateLabel}>Próxima dosis</Text>
                      <Text style={[styles.dateVal, { color: s.color }]}>{fmt(v.nextDueAt)}</Text>
                    </View>
                  </View>
                  {(v.lotNumber || v.clinic?.name) && (
                    <Text style={styles.meta}>
                      {v.clinic?.name ? `${v.clinic.name}` : ''}{v.clinic?.name && v.lotNumber ? ' · ' : ''}{v.lotNumber ? `Lote ${v.lotNumber}` : ''}
                    </Text>
                  )}
                </View>
              );
            })
          )}

          <Text style={styles.foot}>Las vacunas y sus refuerzos los registra el veterinario que atiende a tu mascota. Migo te recuerda cuando toca la próxima dosis. 🐾</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  topbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.text },

  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.brand, borderRadius: radius.lg, padding: 18, boxShadow: cardShadow },
  heroIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  heroPet: { fontSize: 20, fontWeight: '900', color: colors.white },
  heroSub: { fontSize: 13, color: '#F0E6F5', marginTop: 2 },

  alerts: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  chipTxt: { fontSize: 13, fontWeight: '800' },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 40, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', paddingHorizontal: 24 },
  emptyTxt: { fontSize: 15, fontWeight: '700', color: colors.text },
  emptyHint: { fontSize: 13, color: colors.muted, textAlign: 'center' },

  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, gap: 10, boxShadow: cardShadow },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  vaxName: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.text },
  status: { borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  statusTxt: { fontSize: 12, fontWeight: '800' },
  dates: { flexDirection: 'row', gap: 12 },
  dateBox: { flex: 1, backgroundColor: colors.canvas, borderRadius: radius.md, padding: 10 },
  dateLabel: { fontSize: 11, color: colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  dateVal: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: 3 },
  meta: { fontSize: 13, color: colors.muted },

  foot: { fontSize: 12, color: colors.muted, lineHeight: 18, textAlign: 'center', marginTop: 4 },
});
