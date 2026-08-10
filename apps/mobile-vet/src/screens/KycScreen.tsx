import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { appAlert } from '../lib/dialog';
import { capturePhotoAsDataUri } from '../lib/photo';
import { Button } from '../components/ui';
import { TabIcon } from '../components/TabIcon';
import { cardShadow, colors, radius, type } from '../theme';

const ROLES = [
  { key: 'VET', label: 'Veterinario/a', icon: 'medical' },
  { key: 'GROOMER', label: 'Peluquero / Estética', icon: 'scissors' },
  { key: 'RECEPTIONIST', label: 'Recepción', icon: 'person' },
  { key: 'SUPPORT', label: 'Personal de apoyo', icon: 'heartPulse' },
  { key: 'BRANCH_ADMIN', label: 'Admin de sucursal', icon: 'shield' },
] as const;

export default function KycScreen({ onSubmitted }: { onSubmitted: () => void }) {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [position, setPosition] = useState<string>('');
  const [selfie, setSelfie] = useState<string | null>(null);
  const [idDoc, setIdDoc] = useState<string | null>(null);
  const [cmvCard, setCmvCard] = useState<string | null>(null);
  const [collegiateNumber, setCollegiate] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [busy, setBusy] = useState(false);

  const isVet = position === 'VET';

  const submit = async () => {
    if (!position) return appAlert('Falta el rol', 'Selecciona tu rol en la clínica.');
    if (!selfie) return appAlert('Falta la selfie', 'Toma una selfie para verificar tu identidad.');
    if (!idDoc) return appAlert('Falta la cédula', 'Toma una foto de tu cédula.');
    if (isVet && !cmvCard) return appAlert('Falta el carnet', 'Los veterinarios deben subir su carnet del CMV.');
    if (isVet && !collegiateNumber.trim()) return appAlert('Falta el colegiado', 'Escribe tu número de colegiado (CMV).');

    setBusy(true);
    try {
      await api('/staff-kyc', {
        method: 'POST',
        body: {
          requestedPosition: position,
          nationalId: user?.nationalId ?? user?.email ?? 'SIN-CEDULA',
          selfieUrl: selfie,
          idDocumentUrl: idDoc,
          cmvCardUrl: isVet ? cmvCard : undefined,
          collegiateNumber: isVet ? collegiateNumber.trim() : undefined,
          specialty: isVet ? specialty.trim() || undefined : undefined,
        },
      });
      onSubmitted();
    } catch (e) {
      appAlert('No se pudo enviar', e instanceof Error ? e.message : 'Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <Text style={styles.title}>Verificación de identidad</Text>
        <Pressable onPress={logout} hitSlop={10}><Text style={styles.logout}>Salir</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: Math.max(insets.bottom, 40) }} showsVerticalScrollIndicator={false}>
        <Text style={styles.sub}>Para unirte a una clínica en Migo, verificamos tu identidad. Tus datos van cifrados y solo los revisa el equipo Migo.</Text>

        {/* Rol */}
        <Text style={styles.section}>1 · ¿Cuál es tu rol?</Text>
        <View style={styles.roles}>
          {ROLES.map((r) => {
            const on = position === r.key;
            return (
              <Pressable key={r.key} style={[styles.role, on && styles.roleOn]} onPress={() => setPosition(r.key)}>
                <TabIcon name={r.icon} color={on ? colors.white : colors.brand} size={20} />
                <Text style={[styles.roleTxt, on && styles.roleTxtOn]}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Capturas */}
        <Text style={styles.section}>2 · Documentos</Text>
        <Capture label="Selfie" hint="Cámara frontal, buena luz" value={selfie} onPress={async () => setSelfie(await capturePhotoAsDataUri({ front: true }))} icon="person" />
        <Capture label="Cédula" hint="Foto clara del frente" value={idDoc} onPress={async () => setIdDoc(await capturePhotoAsDataUri({ aspect: [16, 10] }))} icon="file" />

        {isVet && (
          <>
            <Capture label="Carnet CMV" hint="Colegio de Médicos Veterinarios" value={cmvCard} onPress={async () => setCmvCard(await capturePhotoAsDataUri({ aspect: [16, 10] }))} icon="medical" />
            <Text style={styles.label}>N° de colegiado</Text>
            <TextInput style={styles.input} value={collegiateNumber} onChangeText={setCollegiate} placeholder="CMV-0000" placeholderTextColor={colors.muted} />
            <Text style={styles.label}>Especialidad (opcional)</Text>
            <TextInput style={styles.input} value={specialty} onChangeText={setSpecialty} placeholder="Ej. Cirugía & Medicina Interna" placeholderTextColor={colors.muted} />
          </>
        )}

        <View style={{ marginTop: 22 }}>
          <Button title={busy ? 'Enviando…' : 'Enviar a verificación'} onPress={submit} loading={busy} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Capture({ label, hint, value, onPress, icon }: { label: string; hint: string; value: string | null; onPress: () => void; icon: string }) {
  return (
    <Pressable style={styles.capture} onPress={onPress}>
      {value ? (
        <Image source={{ uri: value }} style={styles.thumb} />
      ) : (
        <View style={styles.thumbPh}><TabIcon name={icon} color={colors.brand} size={24} /></View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.capLabel}>{label}</Text>
        <Text style={styles.capHint}>{value ? 'Toca para volver a tomar' : hint}</Text>
      </View>
      <View style={[styles.capBtn, value && styles.capBtnDone]}>
        <Text style={[styles.capBtnTxt, value && { color: colors.green }]}>{value ? '✓' : 'Tomar'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  title: { fontSize: 20, fontWeight: '900', color: colors.text },
  logout: { color: colors.muted, fontWeight: '700', fontSize: 14 },
  sub: { color: colors.muted, fontSize: 14, marginBottom: 8 },
  section: { fontSize: 16, fontWeight: '800', color: colors.brand, marginTop: 22, marginBottom: 12 },

  roles: { gap: 10 },
  role: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1.5, borderColor: colors.border },
  roleOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  roleTxt: { fontSize: 15, fontWeight: '700', color: colors.text },
  roleTxtOn: { color: colors.white },

  capture: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.white, borderRadius: radius.md, padding: 12, marginBottom: 12, boxShadow: cardShadow },
  thumb: { width: 54, height: 54, borderRadius: 10 },
  thumbPh: { width: 54, height: 54, borderRadius: 10, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  capLabel: { fontSize: 15, fontWeight: '800', color: colors.text },
  capHint: { fontSize: 13, color: colors.muted, marginTop: 2 },
  capBtn: { borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1.5, borderColor: colors.brand },
  capBtnDone: { borderColor: colors.green },
  capBtnTxt: { color: colors.brand, fontWeight: '800', fontSize: 13 },

  label: { ...type.bodySmall, fontWeight: '700', color: colors.text, marginTop: 8, marginBottom: 6 },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: colors.text },
});
