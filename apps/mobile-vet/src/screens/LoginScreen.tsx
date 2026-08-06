import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import { Button } from '../components/ui';
import { colors, radius, type } from '../theme';

export default function LoginScreen({ navigation }: any) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.logoWrap}>
          <Text style={styles.logo}>Migo</Text>
          <View style={styles.badge}><Text style={styles.badgeText}>VET</Text></View>
        </View>
        <Text style={styles.subtitle}>Panel del personal de clínica</Text>

        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

        <TextInput
          style={styles.input}
          placeholder="correo@clinica.com"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor={colors.muted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <View style={{ marginTop: 8 }}>
          <Button title={busy ? 'Ingresando…' : 'Iniciar sesión'} onPress={submit} loading={busy} />
        </View>

        <Pressable style={styles.registerLink} onPress={() => navigation.navigate('Register')} hitSlop={8}>
          <Text style={styles.registerTxt}>¿Nuevo en Migo? <Text style={styles.registerStrong}>Regístrate como personal</Text></Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 14 },
  logoWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 2 },
  logo: { fontSize: 44, fontWeight: '900', color: colors.brand },
  badge: { backgroundColor: colors.brand, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: colors.white, fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  subtitle: { textAlign: 'center', color: colors.muted, fontSize: 15, marginBottom: 18 },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.text },
  errorBox: { backgroundColor: '#FDECEC', borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: '#F8CBCB' },
  errorText: { ...type.bodySmall, color: colors.red },
  registerLink: { alignItems: 'center', marginTop: 24 },
  registerTxt: { color: colors.muted, fontSize: 14 },
  registerStrong: { color: colors.brand, fontWeight: '800' },
});

