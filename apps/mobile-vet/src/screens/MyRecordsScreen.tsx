import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { Loading } from '../components/ui';
import { cardShadow, colors, radius } from '../theme';

interface Rec {
  id: string;
  visitedAt: string;
  reason?: string | null;
  diagnosis?: string | null;
  signedAt?: string | null;
  pet: { name: string; species?: string };
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });

export default function MyRecordsScreen({ navigation }: { navigation: any }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['my-records'], queryFn: () => api<{ data: Rec[] }>('/patients/records/mine') });

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

  const recs = q.data?.data ?? [];
  const pendientes = recs.filter((r) => !r.signedAt).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topbar}>
        <Pressable style={styles.back} onPress={() => navigation.goBack()} hitSlop={10}><Text style={styles.backArrow}>‹</Text></Pressable>
        <Text style={styles.topTitle}>Mis expedientes</Text>
        <View style={{ width: 40 }} />
      </View>

      {q.isLoading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {pendientes > 0 && (
            <View style={styles.banner}><Text style={styles.bannerTxt}>Tienes {pendientes} expediente{pendientes === 1 ? '' : 's'} sin firmar.</Text></View>
          )}

          {recs.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTxt}>Aún no has emitido expedientes.</Text>
              <Text style={styles.emptyHint}>Al atender una consulta o urgencia, el expediente aparecerá aquí para firmarlo.</Text>
            </View>
          ) : (
            recs.map((r) => (
              <View key={r.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.pet}>{r.pet.name}</Text>
                  {r.signedAt ? (
                    <View style={[styles.pill, { backgroundColor: '#DFF3E6' }]}><Text style={[styles.pillTxt, { color: colors.green }]}>✓ Firmado</Text></View>
                  ) : (
                    <View style={[styles.pill, { backgroundColor: '#FEF4E0' }]}><Text style={[styles.pillTxt, { color: colors.amber }]}>Sin firmar</Text></View>
                  )}
                </View>
                <Text style={styles.reason}>{r.reason ?? 'Consulta'} · {fmt(r.visitedAt)}</Text>
                {r.diagnosis ? <Text style={styles.dx} numberOfLines={2}>Dx: {r.diagnosis}</Text> : null}

                {r.signedAt ? (
                  <Text style={styles.signed}>Firmado el {fmt(r.signedAt)}</Text>
                ) : (
                  <Pressable style={[styles.signBtn, sign.isPending && { opacity: 0.6 }]} disabled={sign.isPending} onPress={() => confirmSign(r)}>
                    <Text style={styles.signTxt}>✍️ Firmar expediente</Text>
                  </Pressable>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  topbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  back: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', boxShadow: cardShadow },
  backArrow: { fontSize: 30, color: colors.brand, marginTop: -6, fontWeight: '800' },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.text },

  banner: { backgroundColor: '#FEF4E0', borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: '#F5D08A' },
  bannerTxt: { fontSize: 14, fontWeight: '700', color: colors.amber },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 40, paddingHorizontal: 24 },
  emptyTxt: { fontSize: 15, fontWeight: '800', color: colors.text },
  emptyHint: { fontSize: 13, color: colors.muted, textAlign: 'center' },

  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, gap: 6, boxShadow: cardShadow },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pet: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
  pill: { borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  pillTxt: { fontSize: 12, fontWeight: '800' },
  reason: { fontSize: 14, color: colors.muted },
  dx: { fontSize: 14, color: colors.text },
  signed: { fontSize: 13, color: colors.green, fontWeight: '700', marginTop: 4 },
  signBtn: { marginTop: 8, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.brand },
  signTxt: { color: colors.white, fontWeight: '800', fontSize: 14 },
});
