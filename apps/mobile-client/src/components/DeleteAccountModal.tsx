import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { Button } from './ui';
import { PasswordInput } from './formFields';
import { colors, radius } from '../theme';

/**
 * Modal de eliminación de cuenta. Pide la contraseña para confirmar; al borrar,
 * `onDeleted` cierra la sesión (el backend anonimiza y marca la cuenta como eliminada).
 */
export function DeleteAccountModal({ visible, onClose, onDeleted }: { visible: boolean; onClose: () => void; onDeleted: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => { setPassword(''); setError(''); onClose(); };

  const submit = async () => {
    setError('');
    if (!password) return setError('Escribe tu contraseña para confirmar');
    setBusy(true);
    try {
      await api('/me/delete-account', { method: 'POST', body: { password } });
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar la cuenta');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Eliminar cuenta</Text>
          <Text style={styles.warn}>
            Esta acción es permanente. Se eliminarán tus datos personales y perderás el acceso.
            Escribe tu contraseña para confirmar.
          </Text>
          <PasswordInput label="Contraseña" value={password} onChangeText={setPassword} placeholder="••••••••" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title={busy ? 'Eliminando…' : 'Eliminar mi cuenta'} onPress={submit} loading={busy} variant="danger" />
          <Pressable onPress={close} style={styles.cancelBtn}><Text style={styles.cancel}>Cancelar</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.canvas, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 24, paddingBottom: 34 },
  title: { fontSize: 20, fontWeight: '800', color: colors.red, marginBottom: 8 },
  warn: { fontSize: 14, color: colors.muted, lineHeight: 20, marginBottom: 12 },
  error: { color: colors.red, fontSize: 14, marginBottom: 8 },
  cancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancel: { color: colors.muted, fontWeight: '700', fontSize: 15 },
});
