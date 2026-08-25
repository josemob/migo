import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { appAlert } from '../lib/dialog';
import { tokens } from '../lib/api';
import { biometricSupported, enableBiometric, disableBiometric, isBiometricEnabled } from '../lib/biometric';
import { TabIcon } from './TabIcon';
import { cardShadow, colors, radius } from '../theme';

/** Toggle de acceso por huella/rostro. Se oculta si el equipo no soporta biometría. */
export function BiometricToggle() {
  const [on, setOn] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    isBiometricEnabled().then(setOn);
    biometricSupported().then(setSupported);
  }, []);

  const toggle = async (next: boolean) => {
    if (next) {
      if (!(await biometricSupported())) {
        return appAlert('Biometría no disponible', 'Primero configura una huella o rostro en los ajustes de tu teléfono.');
      }
      setOn(await enableBiometric(tokens.refresh));
    } else {
      await disableBiometric();
      setOn(false);
    }
  };

  if (!supported) return null;

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}><TabIcon name="fingerprint" color={colors.brand} size={20} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>Iniciar sesión con huella / rostro</Text>
        <Text style={styles.sub}>Entra rápido sin escribir tu contraseña.</Text>
      </View>
      <Pressable onPress={() => toggle(!on)} style={[styles.toggle, { backgroundColor: on ? colors.brand : '#D8D2DE' }]}>
        <View style={[styles.knob, { alignSelf: on ? 'flex-end' : 'flex-start' }]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, boxShadow: cardShadow },
  iconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontWeight: '700', color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  toggle: { width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white },
});
