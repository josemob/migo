import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { BackButton } from '../components/BackButton';
import { Button, Loading } from '../components/ui';
import { cardShadow, colors, radius } from '../theme';

interface Ficha {
  id: string;
  name: string;
  species?: string;
  breed?: string;
  sex?: string | null;
  birthDate?: string | null;
  weightKg?: string | number | null;
  microchip?: string | null;
  owner?: { fullName: string; phone?: string | null; nationalId?: string | null } | null;
  allergies: { substance: string }[];
  conditions: { name: string }[];
  vaccinations: { vaccineName: string; appliedAt: string; nextDueAt?: string | null }[];
  records: { id: string; visitedAt: string; reason?: string | null; diagnosis?: string | null; vet?: { user?: { fullName?: string } } | null }[];
}

const ageFrom = (iso?: string | null) => {
  if (!iso) return null;
  const y = (Date.now() - new Date(iso).getTime()) / (365.25 * 24 * 3600 * 1000);
  return y >= 1 ? `${y.toFixed(1)} años` : `${Math.round(y * 12)} meses`;
};
const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });

export default function PatientDetailScreen({ navigation, route }: any) {
  const { petId } = route.params;
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useQuery({ queryKey: ['patient', petId], queryFn: () => api<Ficha>(`/patients/${petId}`) });

  if (isLoading || !data) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.head}><BackButton onPress={() => navigation.goBack()} /><Text style={styles.title}>Ficha del Paciente</Text><View style={{ width: 44 }} /></View>
        <Loading />
      </SafeAreaView>
    );
  }

  const age = ageFrom(data.birthDate);
  const upToDate = (d?: string | null) => !d || new Date(d) > new Date();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Ficha del Paciente</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        {/* Cabecera */}
        <View style={styles.hero}>
          <Text style={{ fontSize: 52 }}>🐶</Text>
          <Text style={styles.name}>{data.name}</Text>
          <Text style={styles.sub}>{[data.breed, data.sex, age].filter(Boolean).join(' · ') || data.species}</Text>
          <View style={styles.ownerRow}>
            <Text style={styles.owner}>👤 {data.owner?.fullName ?? '—'}</Text>
            {data.owner?.phone && <Text style={styles.owner}>📞 {data.owner.phone}</Text>}
          </View>
        </View>

        {/* Alertas */}
        {(data.allergies.length > 0 || data.conditions.length > 0) && (
          <View style={styles.alertBox}>
            {data.allergies.length > 0 && (
              <Text style={styles.alertTxt}>⚠️ <Text style={{ fontWeight: '800' }}>ALERGIAS:</Text> {data.allergies.map((a) => a.substance).join(', ')}</Text>
            )}
            {data.conditions.map((c, i) => (
              <Text key={i} style={styles.noteTxt}>🔖 {c.name}</Text>
            ))}
          </View>
        )}

        {/* Stats */}
        <View style={styles.stats}>
          <Stat label="Peso" value={data.weightKg ? `${data.weightKg} Kg` : '—'} />
          <Stat label="Edad" value={age ?? '—'} />
          <Stat label="Chip" value={data.microchip ? `#${data.microchip}` : '—'} />
        </View>

        {/* Vacunas */}
        {data.vaccinations.length > 0 && (
          <>
            <Text style={styles.section}>Esquema de vacunación</Text>
            {data.vaccinations.slice(0, 4).map((v, i) => (
              <View key={i} style={styles.vaxRow}>
                <Text style={styles.vaxName}>{v.vaccineName}</Text>
                <View style={[styles.pill, { backgroundColor: upToDate(v.nextDueAt) ? '#DFF3E6' : '#FDECEC' }]}>
                  <Text style={[styles.pillTxt, { color: upToDate(v.nextDueAt) ? colors.green : colors.red }]}>{upToDate(v.nextDueAt) ? 'Al día' : 'Vencida'}</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Historial */}
        <Text style={styles.section}>Historial de atenciones</Text>
        {data.records.length === 0 && <Text style={styles.emptyTxt}>Sin atenciones registradas.</Text>}
        {data.records.map((r) => (
          <View key={r.id} style={styles.visit}>
            <View style={styles.visitDot} />
            <View style={{ flex: 1 }}>
              <View style={styles.visitTop}>
                <Text style={styles.visitReason}>{r.reason ?? 'Consulta'}</Text>
                <Text style={styles.visitDate}>{fmt(r.visitedAt)}</Text>
              </View>
              {r.diagnosis && <Text style={styles.visitDx}>Dx: {r.diagnosis}</Text>}
              {r.vet?.user?.fullName && <Text style={styles.visitVet}>{r.vet.user.fullName}</Text>}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* CTA fija */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 20 }]}>
        <Button title="+ Iniciar Nueva Consulta" onPress={() => navigation.navigate('NewConsult', { petId: data.id, name: data.name, allergies: data.allergies.map((a) => a.substance), weightKg: data.weightKg })} />
      </View>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 18, fontWeight: '800', color: colors.brand },

  hero: { alignItems: 'center', gap: 4, backgroundColor: colors.white, borderRadius: radius.lg, paddingVertical: 20, boxShadow: cardShadow },
  name: { fontSize: 24, fontWeight: '900', color: colors.text },
  sub: { fontSize: 14, color: colors.muted },
  ownerRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  owner: { fontSize: 13, color: colors.text },

  alertBox: { backgroundColor: '#FEF3F3', borderRadius: radius.lg, padding: 14, marginTop: 14, gap: 6, borderWidth: 1, borderColor: '#F8CBCB' },
  alertTxt: { fontSize: 14, color: colors.red },
  noteTxt: { fontSize: 14, color: '#8A5A1F' },

  stats: { flexDirection: 'row', gap: 10, marginTop: 14 },
  stat: { flex: 1, backgroundColor: colors.white, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', boxShadow: cardShadow },
  statLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  statValue: { fontSize: 16, fontWeight: '900', color: colors.text, marginTop: 3 },

  section: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 22, marginBottom: 10 },
  vaxRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8, boxShadow: cardShadow },
  vaxName: { fontSize: 15, color: colors.text, fontWeight: '600' },
  pill: { borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  pillTxt: { fontSize: 12, fontWeight: '800' },

  visit: { flexDirection: 'row', gap: 12, paddingBottom: 14 },
  visitDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand, marginTop: 5 },
  visitTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  visitReason: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  visitDate: { fontSize: 12, color: colors.muted },
  visitDx: { fontSize: 13, color: colors.muted, marginTop: 2 },
  visitVet: { fontSize: 12, color: colors.brand, marginTop: 2 },
  emptyTxt: { color: colors.muted, fontSize: 14 },

  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, backgroundColor: colors.canvas, borderTopWidth: 1, borderTopColor: colors.border },
});
