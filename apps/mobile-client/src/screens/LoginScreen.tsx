import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { appAlert } from '../lib/dialog';
import { Button, Input, Screen } from '../components/ui';
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
    <Screen>
      <View style={styles.logoWrap}>
        {mode === 'register' && <Text style={styles.join}>Únete a</Text>}
        <Logo width={150} />
        <Text style={styles.tagline}>
          {mode === 'login'
            ? 'Cuidamos a quien más quieres, 24/7'
            : 'Crea tu cuenta gratis y empieza a cuidar de tu mejor amigo con la ayuda de nuestra IA.'}
        </Text>
      </View>

      <View style={{ marginTop: 24 }}>
        {mode === 'register' && (
          <>
            <Input label="Nombre completo" value={fullName} onChangeText={setFullName} placeholder="Ej: José Mota" />
            <Input label="Teléfono" value={phone} onChangeText={setPhone} placeholder="+58 412…" keyboardType="phone-pad" />
          </>
        )}
        <Input label="Correo" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="ejemplo@correo.com" />
        <Input label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
        {mode === 'register' && (
          <Input label="Repite tu contraseña" value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="••••••••" />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title={mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'} onPress={submit} loading={busy} />

        {mode === 'login' && (
          <Text style={styles.forgot} onPress={() => appAlert('Recuperar', 'Función disponible próximamente.')}>
            ¿Olvidaste tu contraseña?
          </Text>
        )}

        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.dividerText}>o continúa con</Text>
          <View style={styles.line} />
        </View>

        <Button
          title="Continuar con Google"
          variant="outline"
          onPress={() => appAlert('Google', 'Inicio con Google: pendiente de configurar OAuth.')}
        />

        <Text style={styles.switch} onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? '¿Eres nuevo en Migo? ' : '¿Ya tienes cuenta? '}
          <Text style={{ color: colors.brand, fontWeight: '700' }}>
            {mode === 'login' ? 'Crear una cuenta' : 'Inicia sesión'}
          </Text>
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logoWrap: { alignItems: 'center', marginTop: 40 },
  join: { fontSize: 22, fontWeight: '800', color: colors.brand, marginBottom: 4 },
  tagline: { fontSize: 14, color: colors.muted, marginTop: 10, textAlign: 'center', paddingHorizontal: 20 },
  error: { color: colors.red, marginBottom: 12, fontSize: 14 },
  forgot: { textAlign: 'center', color: colors.brand, marginTop: 16, fontWeight: '700' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.muted, fontSize: 13 },
  switch: { textAlign: 'center', color: colors.muted, marginTop: 20 },
});
