import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { Button } from '../components/ui';
import { TabIcon } from '../components/TabIcon';
import { cardShadow, colors, radius, type } from '../theme';

interface Rx { drug: string; dose: string; frequency: string }

export default function NewConsultScreen({ navigation, route }: any) {
  const { petId, name, allergies = [], weightKg: prevWeight } = route.params as { petId: string; name: string; allergies?: string[]; weightKg?: string | number };

  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState('');
  const [weight, setWeight] = useState(prevWeight ? String(prevWeight) : '');
  const [temp, setTemp] = useState('');
  const [fc, setFc] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [treatment, setTreatment] = useState('');
  const [rx, setRx] = useState<Rx[]>([]);
  const [busy, setBusy] = useState(false);
  const [markDone, setMarkDone] = useState(true);

  const addRx = () => setRx((s) => [...s, { drug: '', dose: '', frequency: '' }]);
  const setRxAt = (i: number, patch: Partial<Rx>) => setRx((s) => s.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const delRx = (i: number) => setRx((s) => s.filter((_, j) => j !== i));

  const emit = async (sign: boolean) => {
    if (!symptoms.trim() && !diagnosis.trim()) return appAlert('Faltan datos', 'Ingresa al menos los síntomas o el diagnóstico.');
    setBusy(true);
    try {
      const created = await api<{ id: string }>(`/patients/${petId}/records`, {
        method: 'POST',
        body: {
          reason: reason.trim() || diagnosis.trim() || 'Consulta',
          symptoms: symptoms.trim() || undefined,
          diagnosis: diagnosis.trim() || undefined,
          treatment: treatment.trim() || undefined,
          weightKg: weight ? Number(weight) : undefined,
          temperature: temp ? Number(temp) : undefined,
          notes: fc ? `F.C.: ${fc} lpm` : undefined,
          sign,
          prescriptions: rx.filter((r) => r.drug.trim()).map((r) => ({ drug: r.drug.trim(), dose: r.dose.trim() || undefined, frequency: r.frequency.trim() || undefined })),
        },
      });

      // Marca la cita de hoy de este paciente como concluida (si el vet lo dejó activo)
      if (markDone) {
        try {
          const from = new Date(); from.setHours(0, 0, 0, 0);
          const to = new Date(); to.setHours(23, 59, 59, 999);
          const appts = await api<{ data: { id: string; status: string; pet: { id: string } }[] }>(
            `/appointments?from=${from.toISOString()}&to=${to.toISOString()}`,
          );
          const match = appts.data.find((a) => a.pet?.id === petId && ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(a.status));
          if (match) await api(`/appointments/${match.id}/status`, { method: 'POST', body: { status: 'COMPLETED' } });
        } catch { /* no bloquea la emisión del expediente */ }
      }

      navigation.replace('Report', { recordId: created.id, petId, name });
    } catch (e) {
      appAlert('No se pudo emitir', e instanceof Error ? e.message : 'Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const confirmSign = () =>
    appAlert('Finalizar y firmar', 'Al firmar, el informe queda finalizado y visible para el dueño con tu firma. ¿Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Firmar', onPress: () => emit(true) },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}><Text style={styles.x}>✕</Text></Pressable>
        <Text style={styles.title}>Nueva Consulta</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Paciente */}
          <View style={styles.patient}>
            <Text style={styles.patientName}>🐶 {name}</Text>
            {allergies.length > 0 && <View style={styles.allergy}><Text style={styles.allergyTxt}>⚠️ Alérgico a: {allergies.join(', ')}</Text></View>}
          </View>

          {/* Copiloto de voz (placeholder) */}
          <Pressable style={styles.copilot} onPress={() => appAlert('Migo AI Copilot', 'El dictado por voz que llena los campos llega en la próxima entrega. Por ahora completa los campos manualmente.')}>
            <View style={styles.mic}><TabIcon name="phone" color={colors.white} size={22} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.copilotTitle}>Migo AI Copilot</Text>
              <Text style={styles.copilotSub}>Presiona para dictar la consulta (próximamente)</Text>
            </View>
          </Pressable>

          <Field label="Motivo de la consulta"><TextInput style={styles.input} value={reason} onChangeText={setReason} placeholder="Ej. Control post-operatorio" placeholderTextColor={colors.muted} /></Field>

          <Text style={styles.sec}>A · Constantes vitales</Text>
          <View style={styles.row3}>
            <Small label="Peso (Kg)"><TextInput style={styles.input} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="8.4" placeholderTextColor={colors.muted} /></Small>
            <Small label="Temp (°C)"><TextInput style={styles.input} value={temp} onChangeText={setTemp} keyboardType="decimal-pad" placeholder="38.5" placeholderTextColor={colors.muted} /></Small>
            <Small label="F.C. (lpm)"><TextInput style={styles.input} value={fc} onChangeText={setFc} keyboardType="number-pad" placeholder="110" placeholderTextColor={colors.muted} /></Small>
          </View>

          <Text style={styles.sec}>B · Síntomas y exploración</Text>
          <TextInput style={[styles.input, styles.area]} value={symptoms} onChangeText={setSymptoms} placeholder="Describe los signos y hallazgos…" placeholderTextColor={colors.muted} multiline />

          <Text style={styles.sec}>C · Diagnóstico presuntivo</Text>
          <TextInput style={styles.input} value={diagnosis} onChangeText={setDiagnosis} placeholder="Ej. Dermatitis alérgica por pulgas (DAPP)" placeholderTextColor={colors.muted} />

          <Text style={styles.sec}>D · Tratamiento y receta</Text>
          <TextInput style={[styles.input, styles.area]} value={treatment} onChangeText={setTreatment} placeholder="Indicación médica / plan terapéutico…" placeholderTextColor={colors.muted} multiline />

          {rx.map((r, i) => (
            <View key={i} style={styles.rxCard}>
              <View style={styles.rxTop}>
                <Text style={styles.rxNum}>Medicamento {i + 1}</Text>
                <Pressable onPress={() => delRx(i)} hitSlop={8}><Text style={styles.rxDel}>Quitar</Text></Pressable>
              </View>
              <TextInput style={styles.input} value={r.drug} onChangeText={(t) => setRxAt(i, { drug: t })} placeholder="Fármaco (ej. NexGard Spectra)" placeholderTextColor={colors.muted} />
              <View style={styles.row2}>
                <TextInput style={[styles.input, { flex: 1 }]} value={r.dose} onChangeText={(t) => setRxAt(i, { dose: t })} placeholder="Dosis" placeholderTextColor={colors.muted} />
                <TextInput style={[styles.input, { flex: 1 }]} value={r.frequency} onChangeText={(t) => setRxAt(i, { frequency: t })} placeholder="Frecuencia" placeholderTextColor={colors.muted} />
              </View>
            </View>
          ))}
          <Pressable style={styles.addRx} onPress={addRx}><Text style={styles.addRxTxt}>+ Agregar medicamento</Text></Pressable>

          <Pressable style={styles.checkRow} onPress={() => setMarkDone((v) => !v)}>
            <View style={[styles.checkbox, markDone && styles.checkboxOn]}>{markDone && <Text style={styles.checkMark}>✓</Text>}</View>
            <Text style={styles.checkLabel}>Marcar la cita de hoy como concluida</Text>
          </Pressable>

          <View style={{ marginTop: 16, gap: 10 }}>
            <Button title={busy ? 'Guardando…' : '✍️  Finalizar y firmar'} onPress={confirmSign} loading={busy} />
            <Pressable style={styles.draftBtn} onPress={() => emit(false)} disabled={busy}>
              <Text style={styles.draftTxt}>Guardar sin firmar</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={{ marginTop: 16 }}><Text style={styles.label}>{label}</Text>{children}</View>;
}
function Small({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={{ flex: 1 }}><Text style={styles.label}>{label}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#EFEAF3' },
  x: { fontSize: 20, fontWeight: '800', color: colors.text },
  title: { fontSize: 18, fontWeight: '800', color: colors.brand },

  patient: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, boxShadow: cardShadow },
  patientName: { fontSize: 17, fontWeight: '800', color: colors.text },
  allergy: { backgroundColor: '#FEF3F3', borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, marginTop: 8, alignSelf: 'flex-start' },
  allergyTxt: { fontSize: 13, color: colors.red, fontWeight: '600' },

  copilot: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, marginTop: 14, borderWidth: 2, borderColor: colors.brandLight },
  mic: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  copilotTitle: { fontSize: 15, fontWeight: '800', color: colors.brand },
  copilotSub: { fontSize: 13, color: colors.muted, marginTop: 2 },

  label: { ...type.bodySmall, fontWeight: '700', color: colors.text, marginBottom: 6 },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text },
  area: { height: 90, textAlignVertical: 'top', paddingTop: 12 },
  sec: { fontSize: 15, fontWeight: '800', color: colors.brand, marginTop: 20, marginBottom: 8 },
  row3: { flexDirection: 'row', gap: 10 },
  row2: { flexDirection: 'row', gap: 10, marginTop: 8 },

  rxCard: { backgroundColor: '#FBF7FD', borderRadius: radius.md, padding: 12, marginTop: 10, gap: 4, borderWidth: 1, borderColor: colors.brandLight },
  rxTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  rxNum: { fontSize: 13, fontWeight: '800', color: colors.brand },
  rxDel: { fontSize: 13, color: colors.red, fontWeight: '700' },
  addRx: { alignItems: 'center', paddingVertical: 12, marginTop: 10, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brand, borderStyle: 'dashed' },
  addRxTxt: { color: colors.brand, fontWeight: '800', fontSize: 14 },
  draftBtn: { alignItems: 'center', paddingVertical: 12 },
  draftTxt: { color: colors.muted, fontWeight: '700', fontSize: 14 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22 },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: colors.brand },
  checkMark: { color: colors.white, fontSize: 15, fontWeight: '900' },
  checkLabel: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 },
});
