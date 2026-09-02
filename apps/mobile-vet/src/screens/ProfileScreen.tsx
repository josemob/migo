import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { pickPhotoAsDataUri } from '../lib/photo';
import { useAuth } from '../lib/auth';
import { useIndependentBack } from '../lib/independentMode';
import { Button } from '../components/ui';
import { TabIcon } from '../components/TabIcon';
import { BiometricToggle } from '../components/BiometricToggle';
import { ChangePasswordModal } from '../components/ChangePasswordModal';
import { cardShadow, colors, radius } from '../theme';

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useAuth();
  const backToIndependent = useIndependentBack();
  const navigation = useNavigation<any>();
  const [pwOpen, setPwOpen] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  const s = user?.staffProfile;
  const isIndependent = !s; // el vet independiente no es staff de clínica
  const avatarUri = avatar ?? user?.avatarUrl;

  // Cambiar foto de perfil: elige de la galería, guarda en el usuario y refresca.
  const changePhoto = async () => {
    const uri = await pickPhotoAsDataUri();
    if (!uri) return;
    setAvatar(uri);
    try {
      await api('/me', { method: 'PATCH', body: { avatarUrl: uri } });
      await refreshUser();
    } catch (e) {
      setAvatar(null);
      appAlert('No se pudo guardar la foto', e instanceof Error ? e.message : 'Intenta de nuevo.');
    }
  };
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={{ padding: 20, gap: 18 }}>
        <Text style={styles.title}>Mi Perfil</Text>
        <View style={styles.card}>
          <Pressable onPress={changePhoto} style={styles.avatarWrap} hitSlop={6}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPh]}><Text style={styles.avatarTxt}>{user?.fullName?.[0] ?? 'D'}</Text></View>
            )}
            <View style={styles.camBadge}><TabIcon name="camera" color={colors.white} size={16} /></View>
          </Pressable>
          <Text style={styles.name}>{user?.fullName}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {s && (
            <View style={styles.chips}>
              <View style={styles.chip}><Text style={styles.chipTxt}>{s.specialty ?? s.roleLabel ?? s.position}</Text></View>
              {s.clinic?.name && <View style={styles.chip}><Text style={styles.chipTxt}>{s.clinic.name}</Text></View>}
            </View>
          )}
        </View>
        {backToIndependent && (
          <Button title="Mi panel de vet independiente" onPress={backToIndependent} />
        )}
        <Button title="Mis expedientes" onPress={() => navigation.navigate('MyRecords')} />
        {isIndependent && (
          <Button title="Mi plan" onPress={() => navigation.navigate('Plan')} />
        )}
        <BiometricToggle />
        <Button title="Cambiar contraseña" variant="outline" onPress={() => setPwOpen(true)} />
        <Button title="Cerrar sesión" variant="outline" onPress={logout} />
      </View>
      <ChangePasswordModal visible={pwOpen} onClose={() => setPwOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  title: { fontSize: 24, fontWeight: '900', color: colors.text },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 24, alignItems: 'center', gap: 6, boxShadow: cardShadow },
  avatarWrap: { position: 'relative' },
  avatar: { width: 84, height: 84, borderRadius: 42 },
  avatarPh: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  camBadge: { position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.white },
  avatarTxt: { color: colors.white, fontSize: 32, fontWeight: '800' },
  name: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 6 },
  email: { fontSize: 14, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, justifyContent: 'center' },
  chip: { backgroundColor: colors.brandLight, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5 },
  chipTxt: { color: colors.brand, fontWeight: '700', fontSize: 12 },
});
