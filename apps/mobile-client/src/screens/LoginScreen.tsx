import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import { useGoogleSignIn } from '../lib/google';
import { api } from '../lib/api';
import { Button, Input } from '../components/ui';
import { PasswordInput, PhoneInput } from '../components/formFields';
import { Logo } from '../components/Logo';
import { colors } from '../theme';

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [forgotStep, setForgotStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
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

  const goForgot = () => {
    setError(''); setNotice(''); setCode(''); setPassword(''); setConfirm('');
    setForgotStep('request'); setMode('forgot');
  };

  const sendResetCode = async () => {
    setError(''); setNotice('');
    if (!email.trim()) return setError('Escribe tu correo');
    setBusy(true);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email: email.trim() } });
      setForgotStep('reset');
      setNotice('Si el correo está registrado, te enviamos un código de 6 dígitos. Revisa tu bandeja (y spam).');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el código');
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    setError(''); setNotice('');
    if (code.trim().length !== 6) return setError('El código son 6 dígitos');
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres');
    if (password !== confirm) return setError('Las contraseñas no coinciden');
    setBusy(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { email: email.trim(), code: code.trim(), newPassword: password } });
      setMode('login'); setCode(''); setPassword(''); setConfirm('');
      setNotice('¡Contraseña actualizada! Ya puedes iniciar sesión.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Código inválido o vencido');
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
              : mode === 'forgot'
              ? 'Te enviaremos un código a tu correo para restablecer tu contraseña.'
              : 'Crea tu cuenta gratis y empieza a cuidar de tu mejor amigo con la ayuda de nuestra IA.'}
          </Text>
        )}
      </View>

      <View style={{ marginTop: kbd ? 0 : 24 }}>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        {mode === 'forgot' ? (
          <>
            <Input label="Correo" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="usuario@holamigo.app" editable={forgotStep === 'request'} />
            {forgotStep === 'request' ? (
              <>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button title="Enviar código" onPress={sendResetCode} loading={busy} />
              </>
            ) : (
              <>
                <Input label="Código (6 dígitos)" value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="123456" maxLength={6} />
                <PasswordInput label="Nueva contraseña" value={password} onChangeText={setPassword} placeholder="••••••••" />
                <PasswordInput label="Repite la contraseña" value={confirm} onChangeText={setConfirm} placeholder="••••••••" />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button title="Restablecer contraseña" onPress={doReset} loading={busy} />
                <Text style={styles.forgot} onPress={sendResetCode}>Reenviar código</Text>
              </>
            )}
            <Text style={styles.switch} onPress={() => { setMode('login'); setError(''); }}>
              <Text style={{ color: colors.brand, fontWeight: '700' }}>Volver a iniciar sesión</Text>
            </Text>
          </>
        ) : (
          <>
            {mode === 'register' && (
              <>
                <Input label="Nombre completo" value={fullName} onChangeText={setFullName} placeholder="John Wick" />
                <PhoneInput label="Teléfono" value={phone} onChangeText={setPhone} />
              </>
            )}
            <Input label="Correo" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="usuario@holamigo.app" />
            <PasswordInput label="Contraseña" value={password} onChangeText={setPassword} placeholder="••••••••" />
            {mode === 'register' && (
              <PasswordInput label="Repite tu contraseña" value={confirm} onChangeText={setConfirm} placeholder="••••••••" />
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button title={mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'} onPress={submit} loading={busy} />

            {mode === 'login' && (
              <Text style={styles.forgot} onPress={goForgot}>
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
  notice: { color: '#2EA84F', marginBottom: 12, fontSize: 14, fontWeight: '600' },
  forgot: { textAlign: 'center', color: colors.brand, marginTop: 16, fontWeight: '700' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.muted, fontSize: 13 },
  switch: { textAlign: 'center', color: colors.muted, marginTop: 20 },
});
