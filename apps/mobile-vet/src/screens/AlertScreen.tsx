import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { Loading } from '../components/ui';
import { cardShadow, colors, radius, triageColor, triageLabel } from '../theme';

interface ActiveAlert {
  id: string; // id de la alerta
  status: string;
  distanceKm?: string | number | null;
  etaMinutes?: number | null;
  emergency: {
    id: string;
    symptoms?: string | null;
    triageLevel?: string | null;
    aiSummary?: string | null;
    aiFirstAid?: string | null;
    status: string;
    latitude?: string | number | null;
    longitude?: string | number | null;
    pet: {
      name: string;
      breed?: string | null;
      species?: string;
      owner: { fullName: string; phone?: string | null; nationalId?: string | null };
      allergies: { substance: string }[];
      conditions: { name: string }[];
    };
  };
}

export default function AlertScreen() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['vet-active-emergencies'],
    queryFn: () => api<{ data: ActiveAlert[] }>('/emergencies/active'),
    refetchInterval: 12000,
  });

  const accept = useMutation({
    mutationFn: (alertId: string) => api(`/emergencies/alerts/${alertId}/accept`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vet-active-emergencies'] }),
    onError: (e) => appAlert('No se pudo aceptar', e instanceof Error ? e.message : 'Puede que otra clínica ya la haya tomado.'),
  });

  const attended = useMutation({
    mutationFn: (emergencyId: string) => api(`/emergencies/${emergencyId}/attended`, { method: 'POST', body: {} }),
    onSuccess: () => { appAlert('Registrada', 'Urgencia marcada como atendida.'); qc.invalidateQueries({ queryKey: ['vet-active-emergencies'] }); },
    onError: (e) => appAlert('No se pudo registrar', e instanceof Error ? e.message : 'Intenta de nuevo.'),
  });

  const openRoute = (lat?: string | number | null, lng?: string | number | null) => {
    if (lat == null || lng == null) return appAlert('Sin ubicación', 'Esta urgencia no tiene ubicación registrada.');
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`).catch(() => {});
  };

  const alerts = q.data?.data ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}><Text style={styles.title}>Guardia & Emergencias</Text></View>

      {q.isLoading ? (
        <Loading />
      ) : alerts.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.icon}>🚨</Text>
          <Text style={styles.emptyTxt}>No hay emergencias entrantes ahora mismo.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {alerts.map((a) => {
            const e = a.emergency;
            const level = e.triageLevel ?? 'ORANGE';
            const tc = triageColor[level] ?? colors.amber;
            const mine = a.status === 'ACCEPTED'; // esta clínica la aceptó
            const km = a.distanceKm != null ? `${Number(a.distanceKm).toFixed(1)} km` : null;
            const phone = e.pet.owner.phone;
            return (
              <View key={a.id} style={[styles.card, { borderColor: tc }]}>
                <View style={styles.top}>
                  <View style={[styles.badge, { backgroundColor: tc }]}><Text style={styles.badgeTxt}>{triageLabel[level] ?? level}</Text></View>
                  {km && <Text style={styles.dist}>{km}{a.etaMinutes ? ` · ~${a.etaMinutes} min` : ''}</Text>}
                </View>

                <Text style={styles.pet}>{e.pet.name}{e.pet.breed ? ` · ${e.pet.breed}` : ''}</Text>
                <Text style={styles.summary}>{e.aiSummary || e.symptoms}</Text>
                {e.aiFirstAid ? <Text style={styles.firstAid}>Primeros auxilios: {e.aiFirstAid}</Text> : null}

                {mine ? (
                  <View style={styles.acceptedBox}>
                    <Text style={styles.acceptedTitle}>✅ Aceptada · contacto del dueño</Text>
                    <Text style={styles.ownerName}>{e.pet.owner.fullName}{e.pet.owner.nationalId ? ` · ${e.pet.owner.nationalId}` : ''}</Text>
                    {e.pet.allergies.length > 0 && <Text style={styles.med}>Alergias: {e.pet.allergies.map((x) => x.substance).join(', ')}</Text>}
                    {e.pet.conditions.length > 0 && <Text style={styles.med}>Condiciones: {e.pet.conditions.map((x) => x.name).join(', ')}</Text>}
                    <View style={styles.actionRow}>
                      <Pressable style={[styles.actionBtn, styles.route]} onPress={() => openRoute(e.latitude, e.longitude)}><Text style={styles.actionTxt}>🧭 Ver ruta</Text></Pressable>
                      {phone ? <Pressable style={[styles.actionBtn, styles.call]} onPress={() => Linking.openURL(`tel:${phone}`)}><Text style={styles.actionTxt}>📞 Llamar</Text></Pressable> : null}
                    </View>
                    <Pressable style={styles.attendedBtn} disabled={attended.isPending} onPress={() => appAlert('Marcar atendida', '¿Confirmas que atendiste esta urgencia? Se registrará el servicio.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Sí, atendida', onPress: () => attended.mutate(e.id) }])}>
                      <Text style={styles.attendedTxt}>Marcar como atendida</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={[styles.acceptBtn, accept.isPending && { opacity: 0.6 }]} disabled={accept.isPending} onPress={() => accept.mutate(a.id)}>
                    <Text style={styles.acceptTxt}>Aceptar y despachar</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  head: { padding: 20 },
  title: { fontSize: 24, fontWeight: '900', color: colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  icon: { fontSize: 40 },
  emptyTxt: { color: colors.muted, fontSize: 15, textAlign: 'center' },

  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, gap: 6, borderWidth: 2, boxShadow: cardShadow },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  badgeTxt: { color: colors.white, fontWeight: '800', fontSize: 12 },
  dist: { fontSize: 13, color: colors.muted, fontWeight: '700' },
  pet: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 4 },
  summary: { fontSize: 14, color: colors.text, lineHeight: 20 },
  firstAid: { fontSize: 13, color: colors.muted, lineHeight: 19 },

  acceptBtn: { backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  acceptTxt: { color: colors.white, fontWeight: '800', fontSize: 15 },

  acceptedBox: { backgroundColor: colors.brandLight, borderRadius: radius.md, padding: 12, gap: 4, marginTop: 8 },
  acceptedTitle: { fontSize: 14, fontWeight: '800', color: colors.green },
  ownerName: { fontSize: 16, fontWeight: '800', color: colors.text },
  med: { fontSize: 13, color: colors.muted },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  actionBtn: { flex: 1, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  route: { backgroundColor: colors.brand },
  call: { backgroundColor: colors.green },
  actionTxt: { color: colors.white, fontWeight: '800', fontSize: 14 },
  attendedBtn: { borderWidth: 1.5, borderColor: colors.brand, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center', marginTop: 6 },
  attendedTxt: { color: colors.brand, fontWeight: '800', fontSize: 14 },
});
