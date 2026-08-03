import { DevSettings, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../lib/auth';
import { Button, Card, Muted, Screen } from '../components/ui';
import { colors } from '../theme';
import { BASE_URL, tokens } from '../lib/api';

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  const devReset = async () => {
    // Limpia flags locales + sesión y recarga para ver onboarding + registro
    await AsyncStorage.multiRemove(['migo_onboarded', 'migo_pet_prompted']);
    await tokens.clear();
    DevSettings.reload();
  };

  return (
    <Screen>
      <Card style={{ alignItems: 'center', gap: 6 }}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.fullName?.[0] ?? 'U'}</Text>
        </View>
        <Text style={styles.name}>{user?.fullName}</Text>
        <Muted>{user?.email}</Muted>
      </Card>

      <Card>
        <Text style={styles.section}>Migo Care</Text>
        <Muted>Teleconsultas ilimitadas, descuentos en la red y almacenamiento médico ilimitado.</Muted>
        <View style={{ height: 12 }} />
        <Button title="Conocer Migo Care" onPress={() => {}} variant="primary" />
      </Card>

      <Button title="Cerrar sesión" onPress={logout} variant="outline" />

      {__DEV__ && (
        <Button title="🔄 Reiniciar onboarding + registro (dev)" onPress={devReset} variant="danger" />
      )}
      <Muted>API: {BASE_URL}</Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 28, fontWeight: '800' },
  name: { fontSize: 20, fontWeight: '800', color: colors.text },
  section: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 6 },
});
