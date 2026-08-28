import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../lib/auth';
import { useIndependentBack } from '../lib/independentMode';
import { Button } from '../components/ui';
import { BiometricToggle } from '../components/BiometricToggle';
import { ChangePasswordModal } from '../components/ChangePasswordModal';
import { cardShadow, colors, radius } from '../theme';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const backToIndependent = useIndependentBack();
  const navigation = useNavigation<any>();
  const [pwOpen, setPwOpen] = useState(false);
  const s = user?.staffProfile;
  const isIndependent = !s; // el vet independiente no es staff de clínica
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={{ padding: 20, gap: 18 }}>
        <Text style={styles.title}>Mi Perfil</Text>
        <View style={styles.card}>
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPh]}><Text style={styles.avatarTxt}>{user?.fullName?.[0] ?? 'D'}</Text></View>
          )}
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
  avatar: { width: 84, height: 84, borderRadius: 42 },
  avatarPh: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: colors.white, fontSize: 32, fontWeight: '800' },
  name: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 6 },
  email: { fontSize: 14, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, justifyContent: 'center' },
  chip: { backgroundColor: colors.brandLight, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5 },
  chipTxt: { color: colors.brand, fontWeight: '700', fontSize: 12 },
});
