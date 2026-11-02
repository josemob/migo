import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { Button, Input } from './ui';
import { colors, radius } from '../theme';

/**
 * Cambio de correo en 2 pasos: 1) correo nuevo → se envía un código a ese correo;
 * 2) código de 6 dígitos → se aplica. El correo anterior recibe un aviso.
 */
export function ChangeEmailModal({ visible, currentEmail, onClose, onChanged }: {
  visible: boolean;
  currentEmail?: string;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    setStep('email'); setEmail(''); setCode(''); setError('');
    onClose();
  };

  const requestCode = async () => {
    setError('');
    const clean = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(clean)) return setError('Escribe un correo válido');
    if (clean === currentEmail?.toLowerCase()) return setError('Ese ya es tu correo actual');
    setBusy(true);
    try {
      await api('/me/email/request', { method: 'POST', body: { newEmail: clean } });
      setStep('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el código');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setError('');
    if (!/^\d{6}$/.test(code.trim())) return setError('El código tiene 6 dígitos');
    setBusy(true);
    try {
      await api('/me/email/confirm', { method: 'POST', body: { code: code.trim() } });
      await onChanged();
      const done = email.trim().toLowerCase();
      close();
      appAlert('Correo actualizado', `Desde ahora inicias sesión con ${done}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el correo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>Cambiar correo</Text>
            {step === 'email' ? (
              <>
                <Text style={styles.sub}>Te enviaremos un código al correo nuevo para confirmar que es tuyo.</Text>
                <Input
                  label="Correo nuevo"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="tucorreo@ejemplo.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
              </>
            ) : (
              <>
                <Text style={styles.sub}>Escribe el código de 6 dígitos que enviamos a {email.trim().toLowerCase()}. Vence en 15 minutos.</Text>
                <Input label="Código" value={code} onChangeText={setCode} placeholder="000000" keyboardType="number-pad" maxLength={6} autoFocus />
                <Pressable onPress={() => { setStep('email'); setCode(''); setError(''); }}>
                  <Text style={styles.link}>Usar otro correo</Text>
                </Pressable>
              </>
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={{ marginTop: 6 }}>
              {step === 'email' ? (
                <Button title={busy ? 'Enviando…' : 'Enviar código'} onPress={requestCode} loading={busy} />
              ) : (
                <Button title={busy ? 'Confirmando…' : 'Confirmar'} onPress={confirm} loading={busy} />
              )}
            </View>
            <Pressable onPress={close} style={styles.cancelBtn}><Text style={styles.cancel}>Cancelar</Text></Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.canvas, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 24, paddingBottom: 34, gap: 4 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 6 },
  sub: { fontSize: 14, color: colors.muted, lineHeight: 20, marginBottom: 12 },
  link: { color: colors.brand, fontWeight: '700', fontSize: 14, marginBottom: 4 },
  error: { color: colors.red, fontSize: 14, marginTop: 4 },
  cancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancel: { color: colors.muted, fontWeight: '700', fontSize: 15 },
});
