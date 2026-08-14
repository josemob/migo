import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import { useGoogleSignIn } from '../lib/google';
import { appAlert } from '../lib/dialog';
import { Button, Input } from '../components/ui';
import { PasswordInput, PhoneInput } from '../components/formFields';
import { Logo } from '../components/Logo';
import { colors } from '../theme';

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('jose.mota@example.com');
  const [password, setPassword] = useState('Migo1234');
  const [confirm, setConfirm] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { signIn: googleSignIn, googleBusy, googleReady } = useGoogleSignIn(setError);

  // Con el teclado abierto se compacta el logo/tagline para que el formulario y
  // los botones quepan centrados en el espacio restante (app arriba, teclado abajo).
  const [kbd, setKbd] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKbd(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbd(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const submit = async () => {
    setError('');
    if (mode === 'register' && password !== confirm) return setError('Las contraseñas no coinciden');
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register({ fullName, email, password, phone });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo continuar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.scroll, kbd && styles.scrollKbd]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
      <View style={[styles.logoWrap, kbd && styles.logoWrapKbd]}>
        {mode === 'register' && !kbd && <Text style={styles.join}>Únete a</Text>}
        <Logo width={150} />
        {!kbd && (
          <Text style={styles.tagline}>
            {mode === 'login'
              ? 'Cuidamos a quien más quieres, 24/7'
              : 'Crea tu cuenta gratis y empieza a cuidar de tu mejor amigo con la ayuda de nuestra IA.'}
          </Text>
        )}
      </View>

      <View style={{ marginTop: kbd ? 0 : 24 }}>
        {mode === 'register' && (
          <>
            <Input label="Nombre completo" value={fullName} onChangeText={setFullName} placeholder="Ej: José Mota" />
            <PhoneInput label="Teléfono" value={phone} onChangeText={setPhone} />
          </>
        )}
        <Input label="Correo" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="ejemplo@correo.com" />
        <PasswordInput label="Contraseña" value={password} onChangeText={setPassword} placeholder="••••••••" />
        {mode === 'register' && (
          <PasswordInput label="Repite tu contraseña" value={confirm} onChangeText={setConfirm} placeholder="••••••••" />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title={mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'} onPress={submit} loading={busy} />

        {mode === 'login' && (
          <Text style={styles.forgot} onPress={() => appAlert('Recuperar', 'Función disponible próximamente.')}>
            ¿Olvidaste tu contraseña?
          </Text>
        )}

        {/* Con el teclado abierto se ocultan Google / divider / "crear cuenta"
            para dejar solo el formulario, centrado sobre el teclado. */}
        {!kbd && (
          <>
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

            <Text style={styles.switch} onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? '¿Eres nuevo en Migo? ' : '¿Ya tienes cuenta? '}
              <Text style={{ color: colors.brand, fontWeight: '700' }}>
                {mode === 'login' ? 'Crear una cuenta' : 'Inicia sesión'}
              </Text>
            </Text>
          </>
        )}
      </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  // flexGrow: 1 permite centrar/expandir; al abrir el teclado (adjustResize) el
  // contenido se hace scrolleable para no tapar los botones de abajo.
  scroll: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  // Teclado abierto: separa 34px el grupo de inputs del teclado
  scrollKbd: { paddingBottom: 34 },
  logoWrap: { alignItems: 'center', marginTop: 40 },
  // Teclado abierto: el logo ocupa el espacio superior y queda centrado vertical
  logoWrapKbd: { flex: 1, marginTop: 0, justifyContent: 'center' },
  join: { fontSize: 22, fontWeight: '800', color: colors.brand, marginBottom: 4 },
  tagline: { fontSize: 14, color: colors.muted, marginTop: 10, textAlign: 'center', paddingHorizontal: 20 },
  error: { color: colors.red, marginBottom: 12, fontSize: 14 },
  forgot: { textAlign: 'center', color: colors.brand, marginTop: 16, fontWeight: '700' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.muted, fontSize: 13 },
  switch: { textAlign: 'center', color: colors.muted, marginTop: 20 },
});
