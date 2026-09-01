import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import { useGoogleSignIn } from '../lib/google';
import { hasBiometricSession } from '../lib/biometric';
import { Button } from '../components/ui';
import { TabIcon } from '../components/TabIcon';
import { MigoLogo } from '../components/MigoLogo';
import { colors, radius, type } from '../theme';

// Íconos de ojo (flat) para mostrar/ocultar la contraseña.
const EYE = 'M12 5c-5 0-9.3 3.1-11 7.5C2.7 16.9 7 20 12 20s9.3-3.1 11-7.5C21.3 8.1 17 5 12 5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z';
const EYE_OFF = 'M12 7a5 5 0 0 1 5 5c0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75C21.27 8.11 17 5 12 5c-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.8 11.8 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zm5.53 5.53 1.55 1.55c-.05.21-.08.43-.08.65a3 3 0 0 0 3 3c.22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53a5 5 0 0 1-5-5c0-.79.2-1.53.53-2.2z';

export default function LoginScreen({ navigation }: any) {
  const { login, loginWithBiometric } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
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
        <View style={styles.pwRow}>
          <TextInput
            style={styles.pwInput}
            placeholder="Contraseña"
            placeholderTextColor={colors.muted}
            secureTextEntry={!showPw}
            value={password}
            onChangeText={setPassword}
          />
          <Pressable
            style={styles.eyeBtn}
            onPress={() => setShowPw((v) => !v)}
            hitSlop={10}
            accessibilityLabel={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            <Svg width={22} height={22} viewBox="0 0 24 24"><Path d={showPw ? EYE_OFF : EYE} fill={colors.muted} /></Svg>
          </Pressable>
        </View>
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
  pwRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 16 },
  pwInput: { flex: 1, paddingVertical: 14, fontSize: 16, color: colors.text },
  eyeBtn: { paddingVertical: 8, paddingLeft: 10 },
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

