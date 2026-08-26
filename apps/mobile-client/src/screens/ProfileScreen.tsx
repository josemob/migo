import { useEffect, useState } from 'react';
import { DevSettings, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { api, tokens } from '../lib/api';
import { useAuth } from '../lib/auth';
import { appAlert } from '../lib/dialog';
import { biometricSupported, enableBiometric, disableBiometric, isBiometricEnabled } from '../lib/biometric';
import { editField } from '../lib/editField';
import { pickPhotoAsDataUri } from '../lib/photo';
import { Button } from '../components/ui';
import { ChangePasswordModal } from '../components/ChangePasswordModal';
import { TabIcon } from '../components/TabIcon';
import { BackButton } from '../components/BackButton';
import { cardShadow, colors, radius } from '../theme';

interface Pet {
  id: string;
  name: string;
  breed?: string;
  species: string;
  birthDate?: string;
  photoUrl?: string;
}

export default function ProfileScreen({ navigation }: { navigation: any }) {
  const { user, logout, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [faceId, setFaceId] = useState(false);
  const [push, setPush] = useState(true);
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => { isBiometricEnabled().then(setFaceId); }, []);

  const toggleBiometric = async (next: boolean) => {
    if (next) {
      if (!(await biometricSupported())) {
        return appAlert('Biometría no disponible', 'Primero configura una huella o rostro en los ajustes de tu teléfono.');
      }
      setFaceId(await enableBiometric(tokens.refresh));
    } else {
      await disableBiometric();
      setFaceId(false);
    }
  };
  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);
  const avatar = avatarOverride ?? user?.avatarUrl ?? null;

  const changeAvatar = async () => {
    const uri = await pickPhotoAsDataUri();
    if (!uri) return;
    setAvatarOverride(uri); // muestra la nueva de inmediato
    try {
      await api('/me', { method: 'PATCH', body: { avatarUrl: uri } });
      await refreshUser();
    } catch (e) {
      appAlert('No se pudo guardar la foto', e instanceof Error ? e.message : 'Intenta de nuevo');
    }
  };
  const pets = useQuery({ queryKey: ['pets'], queryFn: () => api<{ data: Pet[] }>('/me/pets') });
  const soon = () => appAlert('Migo', 'Función disponible próximamente.');

  const editName = () =>
    editField({
      title: 'Tu nombre',
      value: user?.fullName ?? '',
      onSave: async (v) => {
        if (!v.trim()) return;
        await api('/me', { method: 'PATCH', body: { fullName: v.trim() } });
        await refreshUser();
      },
    });

  const devReset = async () => {
    await AsyncStorage.multiRemove(['migo_onboarded', 'migo_pet_prompted']);
    await tokens.clear();
    DevSettings.reload();
  };

  const confirmDelete = () =>
    appAlert('Eliminar cuenta', 'Esta acción es permanente. ¿Deseas continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: soon },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>Mi Perfil</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {/* Perfil */}
        <View style={styles.hero}>
          <Pressable style={styles.avatarWrap} onPress={changeAvatar}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user?.fullName?.[0] ?? 'U'}</Text>
              </View>
            )}
            <View style={styles.editBadge}>
              <TabIcon name="edit" color={colors.white} size={13} />
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.fullName}</Text>
            <Text style={styles.email}>{user?.email}</Text>
            <Pressable style={styles.editData} onPress={editName}>
              <TabIcon name="edit" color={colors.brand} size={14} />
              <Text style={styles.editDataText}>Editar Datos</Text>
            </Pressable>
          </View>
        </View>

        {/* Mis Mascotas */}
        <Text style={styles.sectionBig}>Mis Mascotas</Text>
        {pets.data?.data.map((p) => (
          <View key={p.id} style={styles.petRow}>
            {p.photoUrl ? (
              <Image source={{ uri: p.photoUrl }} style={styles.petImg} />
            ) : (
              <View style={[styles.petImg, styles.petImgPh]}>
                <Text style={{ fontSize: 24 }}>{p.species === 'CAT' ? '🐱' : '🐶'}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.petName}>{p.name}</Text>
              <Text style={styles.petSub}>{p.breed}</Text>
            </View>
            <Pressable style={styles.verBtn} onPress={() => navigation.navigate('PetProfile', { id: p.id })}>
              <Text style={styles.verText}>Ver</Text>
            </Pressable>
          </View>
        ))}
        <Pressable style={styles.addPet} onPress={() => navigation.navigate('RegisterPet')}>
          <Text style={styles.addPetText}>+ Agregar otra mascota</Text>
        </Pressable>

        {/* Seguridad */}
        <View style={[styles.card, { marginTop: 24 }]}>
          <Text style={styles.cardTitle}>Seguridad</Text>
          <Row icon="lock" label="Contraseña" onPress={() => setPwOpen(true)} />
          <Row icon="fingerprint" label="Iniciar sesión con huella / rostro" toggle value={faceId} onToggle={toggleBiometric} border />
        </View>

        {/* Preferencias */}
        <View style={[styles.card, { marginTop: 20 }]}>
          <Text style={styles.cardTitle}>Preferencias</Text>
          <Row icon="bell" label="Notificaciones Push" toggle value={push} onToggle={setPush} />
        </View>

        <View style={{ gap: 12, marginTop: 24 }}>
          <Button title="Cerrar Sesión" onPress={logout} variant="primary" />
          <Button title="Eliminar Cuenta" onPress={confirmDelete} variant="dangerOutline" />
          {__DEV__ && <Button title="🔄 Reiniciar (dev)" onPress={devReset} variant="outline" />}
        </View>
      </ScrollView>
      <ChangePasswordModal visible={pwOpen} onClose={() => setPwOpen(false)} />
    </SafeAreaView>
  );
}

function Row({ icon, label, sub, onPress, toggle, value, onToggle, border }: { icon: string; label: string; sub?: string; onPress?: () => void; toggle?: boolean; value?: boolean; onToggle?: (v: boolean) => void; border?: boolean }) {
  return (
    <Pressable style={[styles.row, border && styles.rowBorder]} onPress={toggle ? () => onToggle?.(!value) : onPress}>
      <View style={styles.rowIcon}>
        <TabIcon name={icon} color={colors.brand} size={20} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {toggle ? (
        <Toggle value={!!value} onChange={(v) => onToggle?.(v)} />
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </Pressable>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={[styles.toggle, { backgroundColor: value ? colors.brand : '#D8D2DE' }]}>
      <View style={[styles.knob, { alignSelf: value ? 'flex-end' : 'flex-start' }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  back: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  backArrow: { fontSize: 22, color: colors.text },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.text },

  hero: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, borderWidth: 2, borderColor: colors.accent, boxShadow: cardShadow },
  avatarWrap: { position: 'relative' },
  avatar: { width: 72, height: 72, borderRadius: 16, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 30, fontWeight: '800' },
  editBadge: { position: 'absolute', top: -6, right: -6, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  name: { fontSize: 22, fontWeight: '800', color: colors.text },
  email: { fontSize: 14, color: colors.muted, marginTop: 2 },
  editData: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#F1ECF5', borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5, marginTop: 8 },
  editDataText: { color: colors.brand, fontWeight: '700', fontSize: 13 },

  sectionBig: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 24, marginBottom: 12 },
  petRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, boxShadow: cardShadow, marginBottom: 12 },
  petImg: { width: 50, height: 50, borderRadius: 12 },
  petImgPh: { backgroundColor: '#EFE3F5', alignItems: 'center', justifyContent: 'center' },
  petName: { fontSize: 17, fontWeight: '800', color: colors.text },
  petSub: { fontSize: 13, color: colors.muted },
  verBtn: { borderWidth: 1.5, borderColor: colors.brand, borderRadius: radius.md, paddingHorizontal: 20, paddingVertical: 10 },
  verText: { color: colors.brand, fontWeight: '800' },
  addPet: { borderWidth: 1.5, borderColor: colors.brand, borderRadius: 16, height: 52, alignItems: 'center', justifyContent: 'center' },
  addPetText: { color: colors.brand, fontWeight: '800', fontSize: 15 },

  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 6, paddingTop: 16, boxShadow: cardShadow },
  cardTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginHorizontal: 12, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#F0ECF3' },
  rowIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#F1ECF5', alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  chevron: { fontSize: 24, color: '#C9BBD3', marginRight: 6 },

  toggle: { width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center', marginRight: 6 },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white },
});
