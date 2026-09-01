import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { BackButton } from '../components/BackButton';
import { Button, Loading } from '../components/ui';
import { cardShadow, colors, radius } from '../theme';

const BOOSTERS: { label: string; months: number | null }[] = [
  { label: 'Sin refuerzo', months: null },
  { label: '1 mes', months: 1 },
  { label: '3 meses', months: 3 },
  { label: '6 meses', months: 6 },
  { label: '1 año', months: 12 },
];

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
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['patient', petId], queryFn: () => api<Ficha>(`/patients/${petId}`) });

  // Formulario "Registrar vacuna"
  const [vaxOpen, setVaxOpen] = useState(false);
  const [vaxName, setVaxName] = useState('');
  const [vaxLot, setVaxLot] = useState('');
  const [boosterMonths, setBoosterMonths] = useState<number | null>(12);

  const addVax = useMutation({
    mutationFn: () => {
      const now = new Date();
      let nextDueAt: string | undefined;
      if (boosterMonths != null) {
        const due = new Date(now);
        due.setMonth(due.getMonth() + boosterMonths);
        nextDueAt = due.toISOString();
      }
      return api(`/patients/${petId}/vaccinations`, {
        method: 'POST',
        body: { vaccineName: vaxName.trim(), lotNumber: vaxLot.trim() || undefined, appliedAt: now.toISOString(), nextDueAt },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient', petId] });
      setVaxOpen(false); setVaxName(''); setVaxLot(''); setBoosterMonths(12);
      appAlert('Vacuna registrada', 'Se agregó a la cartilla de la mascota.');
    },
    onError: (e) => appAlert('No se pudo registrar', e instanceof Error ? e.message : 'Intenta de nuevo.'),
  });

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
        <View style={styles.sectionRow}>
          <Text style={styles.section}>Cartilla de vacunación</Text>
          <Pressable onPress={() => setVaxOpen(true)} hitSlop={8}><Text style={styles.addLink}>+ Registrar vacuna</Text></Pressable>
        </View>
        {data.vaccinations.length === 0 ? (
          <Text style={styles.emptyTxt}>Sin vacunas registradas. Toca “Registrar vacuna”.</Text>
        ) : (
          data.vaccinations.map((v, i) => (
            <View key={i} style={styles.vaxRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.vaxName}>{v.vaccineName}</Text>
                {v.nextDueAt && <Text style={styles.vaxDue}>Próxima: {fmt(v.nextDueAt)}</Text>}
              </View>
              <View style={[styles.pill, { backgroundColor: upToDate(v.nextDueAt) ? '#DFF3E6' : '#FDECEC' }]}>
                <Text style={[styles.pillTxt, { color: upToDate(v.nextDueAt) ? colors.green : colors.red }]}>{upToDate(v.nextDueAt) ? 'Al día' : 'Vencida'}</Text>
              </View>
            </View>
          ))
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

      {/* Modal registrar vacuna */}
      <Modal visible={vaxOpen} animationType="slide" transparent onRequestClose={() => setVaxOpen(false)}>
        <View style={styles.mBackdrop}>
          <View style={[styles.mSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.mHandle} />
            <Text style={styles.mTitle}>Registrar vacuna</Text>

            <Text style={styles.mLabel}>Vacuna</Text>
            <TextInput style={styles.mInput} placeholder="Ej. Séxtuple, Rabia, Triple felina…" placeholderTextColor={colors.muted} value={vaxName} onChangeText={setVaxName} />

            <Text style={styles.mLabel}>Lote (opcional)</Text>
            <TextInput style={styles.mInput} placeholder="Ej. AB-12345" placeholderTextColor={colors.muted} value={vaxLot} onChangeText={setVaxLot} />

            <Text style={styles.mLabel}>Próxima dosis (refuerzo)</Text>
            <View style={styles.chipsRow}>
              {BOOSTERS.map((b) => (
                <Pressable key={b.label} style={[styles.chip, boosterMonths === b.months && styles.chipOn]} onPress={() => setBoosterMonths(b.months)}>
                  <Text style={[styles.chipTxt, boosterMonths === b.months && styles.chipTxtOn]}>{b.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.mHint}>Se registra como aplicada hoy. La próxima dosis se le recordará al dueño.</Text>

            <View style={styles.mActions}>
              <Pressable style={[styles.mBtn, styles.mCancel]} onPress={() => setVaxOpen(false)}><Text style={styles.mCancelTxt}>Cancelar</Text></Pressable>
              <Pressable style={[styles.mBtn, styles.mSave, (!vaxName.trim() || addVax.isPending) && { opacity: 0.5 }]} disabled={!vaxName.trim() || addVax.isPending} onPress={() => addVax.mutate()}>
                <Text style={styles.mSaveTxt}>{addVax.isPending ? 'Guardando…' : 'Guardar'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  sectionRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  addLink: { fontSize: 14, fontWeight: '800', color: colors.brand, marginBottom: 12 },
  vaxRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8, boxShadow: cardShadow, gap: 8 },
  vaxName: { fontSize: 15, color: colors.text, fontWeight: '600' },
  vaxDue: { fontSize: 12, color: colors.muted, marginTop: 2 },

  mBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  mSheet: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 8 },
  mHandle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 6 },
  mTitle: { fontSize: 18, fontWeight: '900', color: colors.text, marginBottom: 6 },
  mLabel: { fontSize: 13, fontWeight: '800', color: colors.text, marginTop: 6 },
  mInput: { backgroundColor: colors.canvas, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  chipOn: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  chipTxt: { fontSize: 13, fontWeight: '700', color: colors.muted },
  chipTxtOn: { color: colors.brand },
  mHint: { fontSize: 12, color: colors.muted, marginTop: 6 },
  mActions: { flexDirection: 'row', gap: 12, marginTop: 14 },
  mBtn: { flex: 1, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  mCancel: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border },
  mCancelTxt: { fontSize: 15, fontWeight: '800', color: colors.muted },
  mSave: { backgroundColor: colors.brand },
  mSaveTxt: { fontSize: 15, fontWeight: '800', color: colors.white },
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
