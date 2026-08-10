import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { BackButton } from '../components/BackButton';
import { Button, Loading } from '../components/ui';
import { cardShadow, colors, radius } from '../theme';

interface Record {
  id: string;
  visitedAt: string;
  reason?: string | null;
  symptoms?: string | null;
  diagnosis?: string | null;
  treatment?: string | null;
  weightKg?: string | number | null;
  temperature?: string | number | null;
  notes?: string | null;
  vet?: { user?: { fullName?: string } } | null;
}
interface Ficha {
  name: string;
  owner?: { fullName: string } | null;
  prescriptions: { id: string; drug: string; dose?: string | null; frequency?: string | null }[];
  records: Record[];
}

const fmt = (iso: string) => new Date(iso).toLocaleString('es-VE', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function ReportScreen({ navigation, route }: any) {
  const { recordId, petId } = route.params;
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useQuery({ queryKey: ['patient', petId], queryFn: () => api<Ficha>(`/patients/${petId}`) });

  const rec = data?.records.find((r) => r.id === recordId) ?? data?.records[0] ?? null;
  const vet = rec?.vet?.user?.fullName ?? 'Médico Veterinario';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Informe Clínico</Text>
        <View style={{ width: 44 }} />
      </View>

      {isLoading || !data || !rec ? (
        <Loading />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
            <View style={styles.doc}>
              <View style={styles.docHead}>
                <Text style={styles.docTitle}>Reporte de Consulta</Text>
                <View style={styles.valid}><Text style={styles.validTxt}>Válido</Text></View>
              </View>

              <View style={styles.meta}>
                <Text style={styles.metaRow}>📅 {fmt(rec.visitedAt)}</Text>
                <Text style={styles.metaRow}>🩺 {vet}</Text>
                <Text style={styles.metaRow}>⭐ Paciente: {data.name}</Text>
                <Text style={styles.metaRow}>🏠 Dueño: {data.owner?.fullName ?? '—'}</Text>
              </View>

              <View style={styles.divider} />
              <Text style={styles.section}>Constantes</Text>
              <View style={styles.vitals}>
                <Vital label="Peso" value={rec.weightKg ? `${rec.weightKg} Kg` : '—'} />
                <Vital label="Temp" value={rec.temperature ? `${rec.temperature} °C` : '—'} />
                <Vital label="Notas" value={rec.notes ?? '—'} />
              </View>

              {rec.symptoms && (<><Text style={styles.section}>Sintomatología</Text><Text style={styles.body}>{rec.symptoms}</Text></>)}
              {rec.diagnosis && (<><Text style={styles.section}>Diagnóstico presuntivo</Text><Text style={styles.body}>{rec.diagnosis}</Text></>)}
              {rec.treatment && (<><Text style={styles.section}>Plan terapéutico</Text><Text style={styles.body}>{rec.treatment}</Text></>)}

              {data.prescriptions.length > 0 && (
                <>
                  <Text style={styles.section}>Receta</Text>
                  {data.prescriptions.slice(0, 5).map((p, i) => (
                    <View key={p.id} style={styles.rx}>
                      <Text style={styles.rxDrug}>{i + 1}. {p.drug}</Text>
                      {(p.dose || p.frequency) && <Text style={styles.rxDetail}>{[p.dose, p.frequency].filter(Boolean).join(' · ')}</Text>}
                    </View>
                  ))}
                </>
              )}

              <View style={styles.signed}>
                <Text style={styles.signedTxt}>🖋️ <Text style={{ fontWeight: '800', color: colors.green }}>Documento Firmado Digitalmente</Text> por {vet} · ID #{rec.id.slice(0, 6).toUpperCase()}-VET</Text>
              </View>
            </View>
          </ScrollView>

          <View style={[styles.actions, { paddingBottom: insets.bottom + 20 }]}>
            <View style={{ flex: 1 }}>
              <Button title="Reenviar al dueño" variant="outline" onPress={() => appAlert('Informe disponible', 'El informe ya quedó guardado en el expediente digital del dueño; lo verá en su app. (El reenvío por chat/push llega en la próxima entrega.)')} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Volver a la ficha" onPress={() => navigation.goBack()} />
            </View>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function Vital({ label, value }: { label: string; value: string }) {
  return <View style={styles.vital}><Text style={styles.vitalLabel}>{label}</Text><Text style={styles.vitalValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 18, fontWeight: '800', color: colors.brand },

  doc: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 20, boxShadow: cardShadow },
  docHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  docTitle: { fontSize: 22, fontWeight: '900', color: colors.text, flex: 1 },
  valid: { backgroundColor: '#DFF3E6', borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5 },
  validTxt: { color: colors.green, fontWeight: '800', fontSize: 13 },
  meta: { marginTop: 14, gap: 6 },
  metaRow: { fontSize: 14, color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 16 },
  section: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 14, marginBottom: 8 },
  body: { fontSize: 15, color: colors.text, lineHeight: 22 },
  vitals: { flexDirection: 'row', gap: 10 },
  vital: { flex: 1, backgroundColor: colors.canvas, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  vitalLabel: { fontSize: 12, color: colors.muted },
  vitalValue: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: 2, textAlign: 'center' },
  rx: { backgroundColor: colors.canvas, borderRadius: radius.md, padding: 12, marginBottom: 8 },
  rxDrug: { fontSize: 15, fontWeight: '700', color: colors.text },
  rxDetail: { fontSize: 13, color: colors.muted, marginTop: 2 },
  signed: { marginTop: 18, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
  signedTxt: { fontSize: 13, color: colors.muted, lineHeight: 20 },

  actions: { flexDirection: 'row', gap: 12, padding: 20, borderTopWidth: 1, borderTopColor: colors.border },
});
