import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { Button } from './ui';
import { colors, radius } from '../theme';

interface Prefs { push: boolean; email: boolean; whatsapp: boolean }

/** Preferencias de notificación (push / correo / WhatsApp). Guarda al alternar. */
export function NotificationPrefsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [prefs, setPrefs] = useState<Prefs>({ push: true, email: true, whatsapp: true });

  useEffect(() => {
    if (!visible) return;
    api<Prefs>('/me/notification-prefs').then(setPrefs).catch(() => {});
  }, [visible]);

  const set = (key: keyof Prefs, val: boolean) => {
    setPrefs((p) => ({ ...p, [key]: val }));
    api('/me/notification-prefs', { method: 'PATCH', body: { [key]: val } }).catch(() => {});
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Notificaciones</Text>
          <Row label="Push" sub="Alertas en tu teléfono" value={prefs.push} onChange={(v) => set('push', v)} />
          <Row label="Correo" sub="Recordatorios y comprobantes por email" value={prefs.email} onChange={(v) => set('email', v)} />
          <Row label="WhatsApp" sub="Mensajes por WhatsApp" value={prefs.whatsapp} onChange={(v) => set('whatsapp', v)} />
          <View style={{ marginTop: 12 }}>
            <Button title="Listo" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Row({ label, sub, value, onChange }: { label: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      <Pressable onPress={() => onChange(!value)} style={[styles.toggle, { backgroundColor: value ? colors.brand : '#D8D2DE' }]}>
        <View style={[styles.knob, { alignSelf: value ? 'flex-end' : 'flex-start' }]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.canvas, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 24, paddingBottom: 34 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0ECF3' },
  rowLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
  rowSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  toggle: { width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white },
});
