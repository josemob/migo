import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { Button, Input } from './ui';
import { colors, radius } from '../theme';

/** Modal de cambio de contraseña (contraseña actual → nueva). */
export function ChangePasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    setCurrent(''); setNext(''); setConfirm(''); setError('');
    onClose();
  };

  const submit = async () => {
    setError('');
    if (!current) return setError('Escribe tu contraseña actual');
    if (next.length < 8) return setError('La nueva contraseña debe tener al menos 8 caracteres');
    if (next !== confirm) return setError('Las contraseñas no coinciden');
    setBusy(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      close();
      appAlert('Contraseña actualizada', 'Tu contraseña se cambió correctamente.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Cambiar contraseña</Text>
          <Input label="Contraseña actual" value={current} onChangeText={setCurrent} secureTextEntry placeholder="••••••••" />
          <Input label="Nueva contraseña" value={next} onChangeText={setNext} secureTextEntry placeholder="Mínimo 8 caracteres" />
          <Input label="Repite la nueva contraseña" value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="••••••••" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title={busy ? 'Guardando…' : 'Guardar'} onPress={submit} loading={busy} />
          <Pressable onPress={close} style={styles.cancelBtn}><Text style={styles.cancel}>Cancelar</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.canvas, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 24, paddingBottom: 34 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 12 },
  error: { color: colors.red, fontSize: 14, marginBottom: 8 },
  cancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancel: { color: colors.muted, fontWeight: '700', fontSize: 15 },
});
