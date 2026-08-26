import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import { useGoogleSignIn } from '../lib/google';
import { hasBiometricSession } from '../lib/biometric';
import { Button } from '../components/ui';
import { TabIcon } from '../components/TabIcon';
import { MigoLogo } from '../components/MigoLogo';
import { colors, radius, type } from '../theme';

export default function LoginScreen({ navigation }: any) {
  const { login, loginWithBiometric } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const { signIn: googleSignIn, googleBusy, googleReady } = useGoogleSignIn(setError);

  // Muestra el botón de huella solo si hay una sesión biométrica guardada en este equipo.
  useEffect(() => { hasBiometricSession().then(setBioAvailable); }, []);

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

  const doBiometric = async () => {
    setError('');
    setBioBusy(true);
    try {
      await loginWithBiometric();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar con biometría');
      setBioAvailable(await hasBiometricSession());
    } finally {
      setBioBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.logoWrap}>
          <MigoLogo width={132} />
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
        <View style={[styles.loginRow, { marginTop: 8 }]}>
          <View style={{ flex: 1 }}>
            <Button title={busy ? 'Ingresando…' : 'Iniciar sesión'} onPress={submit} loading={busy} />
          </View>
          {bioAvailable && (
            <Pressable style={styles.bioBtn} onPress={doBiometric} disabled={bioBusy} accessibilityLabel="Iniciar sesión con huella">
              {bioBusy ? <ActivityIndicator color={colors.brand} /> : <TabIcon name="fingerprint" color={colors.brand} size={28} />}
            </Pressable>
          )}
        </View>

        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.dividerText}>o continúa con</Text>
          <View style={styles.line} />
        </View>

        <Button
          title="Continuar con Google"
          variant="outline"
          loading={googleBusy}
          disabled={!googleReady || googleBusy}
          onPress={() => {
            setError('');
            googleSignIn();
          }}
        />

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
  loginRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bioBtn: { width: 56, height: 56, borderRadius: 16, borderWidth: 1.5, borderColor: colors.brand, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.muted, fontSize: 13 },
  registerLink: { alignItems: 'center', marginTop: 24 },
  registerTxt: { color: colors.muted, fontSize: 14 },
  registerStrong: { color: colors.brand, fontWeight: '800' },
});

