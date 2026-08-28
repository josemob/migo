import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { Loading } from '../components/ui';
import { cardShadow, colors, radius } from '../theme';

interface Plan {
  id: string; name: string; priceUsd: number; commissionRate: number;
  maxPatients: number | null; highlight: string | null; isDefault: boolean;
}
interface PlanResp { current: Plan | null; pending: Plan | null; available: Plan[] }

export default function PlanScreen({ navigation }: { navigation: any }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['my-plan'], queryFn: () => api<PlanResp>('/me/plan') });

  const select = useMutation({
    mutationFn: (planId: string) => api<{ ok: boolean; applied: boolean }>('/me/plan/select', { method: 'POST', body: { planId } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['my-plan'] });
      appAlert(
        r.applied ? 'Plan activado' : 'Elección registrada',
        r.applied
          ? 'Tu plan quedó activo.'
          : 'Tu plan quedó como pendiente de pago. Se activará cuando habilitemos el cobro dentro de la app.',
      );
    },
    onError: (e) => appAlert('No se pudo cambiar el plan', e instanceof Error ? e.message : 'Intenta de nuevo.'),
  });

  const data = q.data;
  const pct = (r: number) => `${Math.round(r * 100)}%`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topbar}>
        <Pressable style={styles.back} onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
        <Text style={styles.topTitle}>Mi plan</Text>
        <View style={{ width: 40 }} />
      </View>

      {q.isLoading || !data ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {/* Plan actual */}
          {data.current && (
            <View style={[styles.card, styles.currentCard]}>
              <Text style={styles.currentLabel}>PLAN ACTUAL</Text>
              <View style={styles.rowBetween}>
                <Text style={styles.planName}>{data.current.name}</Text>
                <Text style={styles.price}>{data.current.priceUsd > 0 ? `$${data.current.priceUsd}/mes` : 'Gratis'}</Text>
              </View>
              <Text style={styles.meta}>Comisión Migo por consulta: {pct(data.current.commissionRate)}</Text>
              <Text style={styles.meta}>Expedientes: {data.current.maxPatients == null ? 'ilimitados' : `hasta ${data.current.maxPatients}`}</Text>
            </View>
          )}

          {/* Pendiente de pago */}
          {data.pending && (
            <View style={styles.pendingBox}>
              <Text style={styles.pendingText}>
                Elegiste <Text style={{ fontWeight: '800' }}>{data.pending.name}</Text> · pendiente de pago. Se activará cuando habilitemos el cobro en la app.
              </Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>Cambiar de plan</Text>

          {data.available.map((p) => {
            const isCurrent = data.current?.id === p.id;
            const isPending = data.pending?.id === p.id;
            return (
              <View key={p.id} style={[styles.card, isCurrent && styles.cardActive]}>
                <View style={styles.rowBetween}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.planName}>{p.name}</Text>
                    {p.highlight ? <View style={styles.tag}><Text style={styles.tagTxt}>{p.highlight}</Text></View> : null}
                  </View>
                  <Text style={styles.price}>{p.priceUsd > 0 ? `$${p.priceUsd}/mes` : 'Gratis'}</Text>
                </View>
                <Text style={styles.meta}>Comisión Migo: {pct(p.commissionRate)}</Text>
                <Text style={styles.meta}>Expedientes: {p.maxPatients == null ? 'ilimitados' : `hasta ${p.maxPatients}`}</Text>

                {isCurrent ? (
                  <View style={[styles.btn, styles.btnCurrent]}><Text style={styles.btnCurrentTxt}>Plan actual</Text></View>
                ) : (
                  <Pressable
                    style={[styles.btn, styles.btnChoose, select.isPending && { opacity: 0.6 }]}
                    disabled={select.isPending}
                    onPress={() => select.mutate(p.id)}
                  >
                    <Text style={styles.btnChooseTxt}>
                      {isPending ? 'Pendiente de pago' : p.priceUsd > 0 ? 'Elegir (pendiente de pago)' : 'Elegir plan gratis'}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })}

          <Text style={styles.footNote}>El cobro dentro de la app se habilitará próximamente. Al elegir un plan de pago, tu solicitud queda registrada y se activará cuando el método de pago esté disponible.</Text>
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

  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, gap: 6, boxShadow: cardShadow, borderWidth: 2, borderColor: 'transparent' },
  currentCard: { backgroundColor: colors.brandLight, borderColor: colors.brand },
  cardActive: { borderColor: colors.brand },
  currentLabel: { fontSize: 11, fontWeight: '800', color: colors.brand, letterSpacing: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planName: { fontSize: 18, fontWeight: '800', color: colors.text },
  price: { fontSize: 15, fontWeight: '800', color: colors.brand },
  meta: { fontSize: 13, color: colors.muted },
  tag: { backgroundColor: colors.brand, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  tagTxt: { color: colors.white, fontSize: 10, fontWeight: '800' },

  pendingBox: { backgroundColor: '#FDF6E3', borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: '#E9C46A' },
  pendingText: { fontSize: 13, color: '#7A5B00', lineHeight: 19 },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 6 },

  btn: { borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  btnChoose: { backgroundColor: colors.brand },
  btnChooseTxt: { color: colors.white, fontWeight: '800', fontSize: 14 },
  btnCurrent: { backgroundColor: '#EDEBF2' },
  btnCurrentTxt: { color: colors.muted, fontWeight: '800', fontSize: 14 },

  footNote: { fontSize: 12, color: colors.muted, lineHeight: 18, marginTop: 6 },
});
