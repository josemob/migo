import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { Loading } from '../components/ui';
import { cardShadow, colors, radius } from '../theme';

interface Rx { id: string; drug: string; dose?: string | null; frequency?: string | null; durationDays?: number | null; instructions?: string | null }
interface Detail {
  id: string; visitedAt: string; reason?: string | null; symptoms?: string | null; diagnosis?: string | null; treatment?: string | null;
  weightKg?: string | number | null; temperature?: string | number | null; notes?: string | null;
  signedAt?: string | null; signedByName?: string | null; signedByLicense?: string | null; signedBySpecialty?: string | null;
  pet: { name: string; species?: string; breed?: string | null; owner?: { fullName: string } | null };
  prescriptions: Rx[];
  clinic?: { name: string } | null;
}

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function Section({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sLabel}>{label}</Text>
      <Text style={styles.sVal}>{value}</Text>
    </View>
  );
}

export default function RecordDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const { id } = route.params as { id: string };
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['record', id], queryFn: () => api<Detail>(`/patients/records/${id}`) });
  const d = q.data;

  const sign = useMutation({
    mutationFn: () => api(`/patients/records/${id}/sign`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['record', id] });
      qc.invalidateQueries({ queryKey: ['my-records'] });
      appAlert('Expediente firmado', 'Quedó firmado con tu nombre y colegiado.');
    },
    onError: (e) => appAlert('No se pudo firmar', e instanceof Error ? e.message : 'Intenta de nuevo.'),
  });
  const confirmSign = () =>
    appAlert('Firmar expediente', '¿Firmar este expediente? Quedará firmado con tu nombre y colegiado.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Firmar', onPress: () => sign.mutate() },
    ]);

  const signos = d ? [d.weightKg ? `${d.weightKg} kg` : null, d.temperature ? `${d.temperature} °C` : null].filter(Boolean).join(' · ') : '';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topbar}>
        <Pressable style={styles.back} onPress={() => navigation.goBack()} hitSlop={10}><Text style={styles.backArrow}>‹</Text></Pressable>
        <Text style={styles.topTitle}>Expediente</Text>
        <View style={{ width: 40 }} />
      </View>

      {q.isLoading || !d ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {/* Cabecera */}
          <View style={styles.hero}>
            <Text style={styles.pet}>{d.pet.name}{d.pet.breed ? ` · ${d.pet.breed}` : ''}</Text>
            <Text style={styles.meta}>{d.reason ?? 'Consulta'} · {fmt(d.visitedAt)}</Text>
            {d.pet.owner?.fullName ? <Text style={styles.meta}>Dueño: {d.pet.owner.fullName}</Text> : null}
          </View>

          {/* Firma */}
          {d.signedAt ? (
            <View style={[styles.signBox, { backgroundColor: '#DFF3E6', borderColor: '#A9DEBB' }]}>
              <Text style={[styles.signTitle, { color: colors.green }]}>✓ Firmado el {fmt(d.signedAt)}</Text>
              {d.signedByName ? <Text style={styles.signMeta}>{d.signedByName}{d.signedByLicense ? ` · Col. ${d.signedByLicense}` : ''}{d.signedBySpecialty ? ` · ${d.signedBySpecialty}` : ''}</Text> : null}
            </View>
          ) : (
            <View style={[styles.signBox, { backgroundColor: '#FEF4E0', borderColor: '#F5D08A' }]}>
              <Text style={[styles.signTitle, { color: colors.amber }]}>Expediente sin firmar</Text>
            </View>
          )}

          <Section label="Síntomas" value={d.symptoms} />
          <Section label="Diagnóstico" value={d.diagnosis} />
          <Section label="Tratamiento" value={d.treatment} />
          <Section label="Signos" value={signos || null} />

          {/* Récipe */}
          {d.prescriptions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sLabel}>Récipe</Text>
              {d.prescriptions.map((p) => (
                <View key={p.id} style={styles.rx}>
                  <Text style={styles.rxDrug}>{p.drug}</Text>
                  {(p.dose || p.frequency || p.durationDays) ? (
                    <View style={styles.rxGrid}>
                      {p.dose ? <View style={styles.rxField}><Text style={styles.rxFLabel}>Dosis</Text><Text style={styles.rxFVal}>{p.dose}</Text></View> : null}
                      {p.frequency ? <View style={styles.rxField}><Text style={styles.rxFLabel}>Frecuencia</Text><Text style={styles.rxFVal}>{p.frequency}</Text></View> : null}
                      {p.durationDays ? <View style={styles.rxField}><Text style={styles.rxFLabel}>Duración</Text><Text style={styles.rxFVal}>{p.durationDays} días</Text></View> : null}
                    </View>
                  ) : null}
                  {p.instructions ? <Text style={styles.rxNote}>{p.instructions}</Text> : null}
                </View>
              ))}
            </View>
          )}

          <Section label="Notas" value={d.notes} />

          {!d.signedAt && (
            <Pressable style={[styles.signBtn, sign.isPending && { opacity: 0.6 }]} disabled={sign.isPending} onPress={confirmSign}>
              <Text style={styles.signBtnTxt}>{sign.isPending ? 'Firmando…' : '✍️ Firmar expediente'}</Text>
            </Pressable>
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

  hero: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, gap: 4, boxShadow: cardShadow },
  pet: { fontSize: 19, fontWeight: '900', color: colors.text },
  meta: { fontSize: 14, color: colors.muted },

  signBox: { borderRadius: radius.md, padding: 12, borderWidth: 1, gap: 2 },
  signTitle: { fontSize: 14, fontWeight: '800' },
  signMeta: { fontSize: 13, color: colors.text },

  section: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, gap: 6, boxShadow: cardShadow },
  sLabel: { fontSize: 12, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  sVal: { fontSize: 15, color: colors.text, lineHeight: 22 },

  rx: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginTop: 8 },
  rxDrug: { fontSize: 15, fontWeight: '800', color: colors.text },
  rxGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  rxField: { backgroundColor: colors.canvas, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, minWidth: 76 },
  rxFLabel: { fontSize: 10, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  rxFVal: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 1 },
  rxNote: { fontSize: 13, color: colors.text, marginTop: 6 },

  signBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  signBtnTxt: { color: colors.white, fontWeight: '800', fontSize: 16 },
});
