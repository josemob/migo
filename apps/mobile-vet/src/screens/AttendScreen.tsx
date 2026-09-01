import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { cardShadow, colors, radius } from '../theme';

interface Med { drug: string; dose: string; frequency: string; durationDays: string }

export default function AttendScreen({ route, navigation }: { route: any; navigation: any }) {
  const qc = useQueryClient();
  const { emergencyId, petName, ownerName } = route.params as { emergencyId: string; petName?: string; ownerName?: string };

  const [diagnosis, setDiagnosis] = useState('');
  const [treatment, setTreatment] = useState('');
  const [notes, setNotes] = useState('');
  const [weight, setWeight] = useState('');
  const [temp, setTemp] = useState('');
  const [meds, setMeds] = useState<Med[]>([]);

  const addMed = () => setMeds((m) => [...m, { drug: '', dose: '', frequency: '', durationDays: '' }]);
  const setMed = (i: number, key: keyof Med, v: string) => setMeds((m) => m.map((x, idx) => (idx === i ? { ...x, [key]: v } : x)));
  const removeMed = (i: number) => setMeds((m) => m.filter((_, idx) => idx !== i));

  const num = (s: string) => { const n = Number(s); return s.trim() && !isNaN(n) ? n : undefined; };

  const save = useMutation({
    mutationFn: () =>
      api(`/emergencies/${emergencyId}/attended`, {
        method: 'POST',
        body: {
          diagnosis: diagnosis.trim() || undefined,
          treatment: treatment.trim() || undefined,
          notes: notes.trim() || undefined,
          weightKg: num(weight),
          temperature: num(temp),
          prescriptions: meds
            .filter((m) => m.drug.trim())
            .map((m) => ({
              drug: m.drug.trim(),
              dose: m.dose.trim() || undefined,
              frequency: m.frequency.trim() || undefined,
              durationDays: num(m.durationDays),
            })),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vet-active-emergencies'] });
      appAlert('Consulta finalizada', 'La atención quedó registrada en el expediente y la urgencia se cerró.');
      navigation.goBack();
    },
    onError: (e) => appAlert('No se pudo finalizar', e instanceof Error ? e.message : 'Intenta de nuevo.'),
  });

  const confirmSave = () =>
    appAlert('Finalizar consulta', '¿Guardar la atención y cerrar la urgencia? Quedará en el expediente de la mascota.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Guardar y finalizar', onPress: () => save.mutate() },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topbar}>
        <Pressable style={styles.back} onPress={() => navigation.goBack()} hitSlop={10}><Text style={styles.backArrow}>‹</Text></Pressable>
        <Text style={styles.topTitle}>Atender consulta</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {(petName || ownerName) && (
            <Text style={styles.patient}>{petName ?? 'Paciente'}{ownerName ? ` · ${ownerName}` : ''}</Text>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Diagnóstico</Text>
            <TextInput style={styles.textarea} placeholder="Impresión diagnóstica…" placeholderTextColor={colors.muted} value={diagnosis} onChangeText={setDiagnosis} multiline />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Tratamiento / indicaciones</Text>
            <TextInput style={styles.textarea} placeholder="Plan de tratamiento e indicaciones…" placeholderTextColor={colors.muted} value={treatment} onChangeText={setTreatment} multiline />
          </View>

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.label}>Peso (kg)</Text>
              <TextInput style={styles.input} placeholder="0.0" placeholderTextColor={colors.muted} keyboardType="decimal-pad" value={weight} onChangeText={setWeight} />
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.label}>Temperatura (°C)</Text>
              <TextInput style={styles.input} placeholder="38.5" placeholderTextColor={colors.muted} keyboardType="decimal-pad" value={temp} onChangeText={setTemp} />
            </View>
          </View>

          {/* Receta */}
          <View style={styles.field}>
            <Text style={styles.label}>Receta</Text>
            {meds.length === 0 && <Text style={styles.hint}>Sin medicamentos. Agrega los que recetes.</Text>}
            {meds.map((m, i) => (
              <View key={i} style={styles.medCard}>
                <View style={styles.medTop}>
                  <TextInput style={styles.medDrug} placeholder="Medicamento (ej. Prednisolona 5mg)" placeholderTextColor={colors.muted} value={m.drug} onChangeText={(v) => setMed(i, 'drug', v)} />
                  <Pressable onPress={() => removeMed(i)} hitSlop={8}><Text style={styles.remove}>✕</Text></Pressable>
                </View>
                <View style={styles.medRow}>
                  <TextInput style={styles.medMini} placeholder="Dosis" placeholderTextColor={colors.muted} value={m.dose} onChangeText={(v) => setMed(i, 'dose', v)} />
                  <TextInput style={styles.medMini} placeholder="Frecuencia" placeholderTextColor={colors.muted} value={m.frequency} onChangeText={(v) => setMed(i, 'frequency', v)} />
                  <TextInput style={styles.medMini} placeholder="Días" placeholderTextColor={colors.muted} keyboardType="number-pad" value={m.durationDays} onChangeText={(v) => setMed(i, 'durationDays', v)} />
                </View>
              </View>
            ))}
            <Pressable style={styles.addMed} onPress={addMed}><Text style={styles.addMedTxt}>+ Agregar medicamento</Text></Pressable>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Notas (opcional)</Text>
            <TextInput style={styles.textarea} placeholder="Observaciones, seguimiento…" placeholderTextColor={colors.muted} value={notes} onChangeText={setNotes} multiline />
          </View>

          <Pressable style={[styles.finishBtn, save.isPending && { opacity: 0.6 }]} disabled={save.isPending} onPress={confirmSave}>
            <Text style={styles.finishTxt}>{save.isPending ? 'Guardando…' : '✓ Guardar y finalizar'}</Text>
          </Pressable>
          <Text style={styles.foot}>Todo es opcional: puedes finalizar sin diagnóstico si no aplica.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  topbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  back: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', boxShadow: cardShadow },
  backArrow: { fontSize: 30, color: colors.brand, marginTop: -6, fontWeight: '800' },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.text },

  patient: { fontSize: 15, fontWeight: '800', color: colors.brand },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '800', color: colors.text },
  hint: { fontSize: 13, color: colors.muted },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text },
  textarea: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, minHeight: 84, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },

  medCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, gap: 8 },
  medTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  medDrug: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text, paddingVertical: 2 },
  remove: { fontSize: 16, color: colors.red, fontWeight: '800', paddingHorizontal: 4 },
  medRow: { flexDirection: 'row', gap: 8 },
  medMini: { flex: 1, backgroundColor: colors.canvas, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: colors.text },
  addMed: { alignSelf: 'flex-start', paddingVertical: 8 },
  addMedTxt: { color: colors.brand, fontWeight: '800', fontSize: 14 },

  finishBtn: { backgroundColor: colors.green, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  finishTxt: { color: colors.white, fontWeight: '800', fontSize: 16 },
  foot: { fontSize: 12, color: colors.muted, textAlign: 'center' },
});
