import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { appAlert } from '../lib/dialog';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { TabIcon } from '../components/TabIcon';
import { BackButton } from '../components/BackButton';
import { colors, radius } from '../theme';

interface Props {
  onComplete?: () => void;
  onSkip?: () => void;
  navigation?: any;
}

const SIZES = ['Pequeño', 'Mediano', 'Grande'];

export default function RegisterPetScreen({ onComplete, onSkip, navigation }: Props) {
  const qc = useQueryClient();
  const done = () => (onComplete ? onComplete() : navigation?.goBack());
  const skip = () => (onSkip ? onSkip() : navigation?.goBack());

  const [species, setSpecies] = useState<'DOG' | 'CAT'>('DOG');
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('');
  const [age, setAge] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [showMedical, setShowMedical] = useState(false);
  const [alias, setAlias] = useState('');
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [allergy, setAllergy] = useState('');
  const [busy, setBusy] = useState(false);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return appAlert('Permiso', 'Necesitamos acceso a tus fotos.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.6 });
    if (!res.canceled) setPhoto(res.assets[0].uri);
  };

  const save = async () => {
    if (!name.trim()) return appAlert('Falta el nombre', 'Dinos cómo se llama tu mascota.');
    setBusy(true);
    try {
      const birthDate = age && Number(age) > 0 ? new Date(new Date().setFullYear(new Date().getFullYear() - Number(age))) : undefined;
      const pet = await api<{ id: string }>('/me/pets', {
        method: 'POST',
        body: {
          name,
          species,
          breed: breed || undefined,
          color: color || undefined,
          birthDate,
          alias: alias || undefined,
          size: size || undefined,
        },
      });
      if (allergy.trim()) {
        await api(`/me/pets/${pet.id}/allergies`, { method: 'POST', body: { substance: allergy.trim() } });
      }
      qc.invalidateQueries({ queryKey: ['pets'] });
      done();
    } catch (e) {
      appAlert('Error', e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <BackButton onPress={skip} />
        <Text style={styles.headerTitle}>Registrar Mascota</Text>
        <Pressable style={styles.skip} onPress={skip}>
          <Text style={styles.skipText}>Saltar</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Cuéntanos sobre tu mejor amigo</Text>
        <Text style={styles.subtitle}>Esta información ayuda a la IA de Migo a personalizar su cuidado diario y médico.</Text>

        {/* Foto */}
        <View style={styles.photoWrap}>
          <Pressable style={styles.photoCircle} onPress={pickPhoto}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.photo} />
            ) : (
              <Text style={{ fontSize: 56 }}>{species === 'CAT' ? '🐱' : '🐶'}</Text>
            )}
            <View style={styles.camera}>
              <TabIcon name="medical" color={colors.white} size={16} />
            </View>
          </Pressable>
        </View>

        {/* Tipo */}
        <Text style={styles.label}>¿Qué tipo de mascota es?</Text>
        <View style={styles.typeRow}>
          <TypeBtn label="🐶 Perro" active={species === 'DOG'} onPress={() => setSpecies('DOG')} />
          <TypeBtn label="🐱 Gato" active={species === 'CAT'} onPress={() => setSpecies('CAT')} />
        </View>

        <Field label="Nombre de tu mascota">
          <TextInput style={styles.input} placeholder="Toddy" placeholderTextColor={colors.muted} value={name} onChangeText={setName} />
        </Field>

        <Field label="Raza">
          <View style={styles.inputRow}>
            <TextInput style={styles.inputFlex} placeholder="Selecciona la raza (Ej. Mestizo, Poodle...)" placeholderTextColor={colors.muted} value={breed} onChangeText={setBreed} />
            <Text style={styles.chevron}>⌄</Text>
          </View>
        </Field>

        <Field label="Edad">
          <View style={styles.inputRow}>
            <TextInput style={styles.inputFlex} placeholder="Ej. 2 años" placeholderTextColor={colors.muted} value={age} onChangeText={setAge} keyboardType="numeric" />
            <Text style={styles.chevron}>⌄</Text>
          </View>
        </Field>

        {/* Datos médicos (colapsable) */}
        <Pressable style={[styles.medicalHead, showMedical && styles.medicalHeadOpen]} onPress={() => setShowMedical(!showMedical)}>
          <Text style={styles.medicalTitle}>🩺 Datos médicos y físicos (Opcional)</Text>
          <Text style={styles.medicalChevron}>{showMedical ? '⌃' : '⌄'}</Text>
        </Pressable>

        {showMedical && (
          <View style={styles.medicalBody}>
            <Field label="¿Cómo le dices de cariño? (Alias)">
              <TextInput style={styles.input} placeholder="Ej. El gordo, Chiquito..." placeholderTextColor={colors.muted} value={alias} onChangeText={setAlias} />
            </Field>
            <Text style={styles.label}>Tamaño aproximado</Text>
            <View style={styles.typeRow}>
              {SIZES.map((s) => (
                <TypeBtn key={s} label={s} active={size === s} onPress={() => setSize(s)} small />
              ))}
            </View>
            <Field label="Color dominante">
              <TextInput style={styles.input} placeholder="Ej. Marrón con blanco, Negro" placeholderTextColor={colors.muted} value={color} onChangeText={setColor} />
            </Field>
            <Field label="¿Sufre de alguna alergia o condición especial?">
              <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} placeholder="Describe brevemente alergias, medicamentos o cuidados especiales..." placeholderTextColor={colors.muted} value={allergy} onChangeText={setAllergy} multiline />
            </Field>
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Pressable style={[styles.saveBtn, busy && { opacity: 0.6 }]} onPress={save} disabled={busy}>
          <Text style={styles.saveText}>{busy ? 'Guardando…' : '¡Listo, guardar mascota!'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function TypeBtn({ label, active, onPress, small }: { label: string; active: boolean; onPress: () => void; small?: boolean }) {
  return (
    <Pressable style={[styles.typeBtn, active && styles.typeBtnActive, small && { paddingVertical: 12 }]} onPress={onPress}>
      <Text style={[styles.typeBtnText, active && styles.typeBtnTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  back: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  backArrow: { fontSize: 22, color: colors.text },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  skip: { backgroundColor: colors.accent, paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.full },
  skipText: { fontWeight: '800', color: colors.text },

  title: { fontSize: 26, fontWeight: '800', color: colors.brand, marginTop: 8 },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: 6, lineHeight: 21 },

  photoWrap: { alignItems: 'center', marginVertical: 24 },
  photoCircle: { width: 130, height: 130, borderRadius: 65, backgroundColor: '#EFE3F5', alignItems: 'center', justifyContent: 'center' },
  photo: { width: 130, height: 130, borderRadius: 65 },
  camera: { position: 'absolute', bottom: 6, right: 6, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.white },

  label: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8 },
  typeRow: { flexDirection: 'row', gap: 12 },
  typeBtn: { flex: 1, paddingVertical: 16, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  typeBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  typeBtnText: { fontSize: 15, fontWeight: '700', color: colors.text },
  typeBtnTextActive: { color: colors.white },

  input: { backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 15, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingRight: 16 },
  inputFlex: { flex: 1, paddingHorizontal: 16, paddingVertical: 15, fontSize: 15, color: colors.text },
  chevron: { fontSize: 20, color: colors.muted },

  medicalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F3EAF8', borderRadius: radius.md, padding: 16, marginTop: 22, borderWidth: 1, borderColor: '#E3D0EE', borderStyle: 'dashed' },
  medicalHeadOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  medicalTitle: { fontSize: 15, fontWeight: '800', color: colors.brand },
  medicalChevron: { fontSize: 18, color: colors.brand, fontWeight: '800' },
  medicalBody: { backgroundColor: '#F7F1FB', borderRadius: radius.md, borderTopLeftRadius: 0, borderTopRightRadius: 0, padding: 16, paddingTop: 4, borderWidth: 1, borderColor: '#E3D0EE', borderTopWidth: 0 },

  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingTop: 12, backgroundColor: colors.canvas, borderTopWidth: 1, borderTopColor: colors.border },
  saveBtn: { backgroundColor: colors.brand, paddingVertical: 17, borderRadius: radius.full, alignItems: 'center' },
  saveText: { color: colors.white, fontSize: 17, fontWeight: '800' },
});
