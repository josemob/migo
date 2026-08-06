import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import { BackButton } from '../components/BackButton';
import { Button } from '../components/ui';
import { colors, radius, type } from '../theme';

export default function RegisterScreen({ navigation }: any) {
  const { register } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    if (!fullName.trim()) return setError('Escribe tu nombre completo');
    if (!nationalId.trim()) return setError('Escribe tu cédula');
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres');
    if (password !== confirm) return setError('Las contraseñas no coinciden');
    setBusy(true);
    try {
      await register({ fullName: fullName.trim(), email: email.trim(), password, phone: phone.trim() || undefined, nationalId: nationalId.trim() });
      // Al registrarse queda logueado -> el gate lo lleva al KYC automáticamente
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la cuenta');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Registro de personal</Text>
        <View style={{ width: 44 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.sub}>Crea tu cuenta profesional. Luego verificaremos tu identidad.</Text>
          {error ? <View style={styles.err}><Text style={styles.errTxt}>{error}</Text></View> : null}

          <Field label="Nombre completo"><TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Dr. Nombre Apellido" placeholderTextColor={colors.muted} /></Field>
          <Field label="Cédula"><TextInput style={styles.input} value={nationalId} onChangeText={setNationalId} placeholder="V-12.345.678" placeholderTextColor={colors.muted} autoCapitalize="characters" /></Field>
          <Field label="Correo"><TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="correo@clinica.com" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address" /></Field>
          <Field label="Teléfono (opcional)"><TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="+58 412-0000000" placeholderTextColor={colors.muted} keyboardType="phone-pad" /></Field>
          <Field label="Contraseña"><TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Mínimo 6 caracteres" placeholderTextColor={colors.muted} secureTextEntry /></Field>
          <Field label="Repite la contraseña"><TextInput style={styles.input} value={confirm} onChangeText={setConfirm} placeholder="Repite tu contraseña" placeholderTextColor={colors.muted} secureTextEntry /></Field>

          <View style={{ marginTop: 10 }}>
            <Button title={busy ? 'Creando…' : 'Crear cuenta'} onPress={submit} loading={busy} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 18, fontWeight: '800', color: colors.brand },
  sub: { color: colors.muted, fontSize: 14, marginBottom: 4 },
  label: { ...type.bodySmall, fontWeight: '700', color: colors.text, marginBottom: 6 },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: colors.text },
  err: { backgroundColor: '#FDECEC', borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: '#F8CBCB' },
  errTxt: { ...type.bodySmall, color: colors.red },
});
