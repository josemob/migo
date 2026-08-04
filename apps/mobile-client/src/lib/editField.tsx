import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { cardShadow, colors, radius } from '../theme';

interface EditOptions {
  title: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  numeric?: boolean;
  onSave: (value: string) => void | Promise<void>;
}

let externalOpen: ((opts: EditOptions) => void) | null = null;

/** Abre un editor de un campo (título + input + Guardar). */
export function editField(opts: EditOptions) {
  externalOpen?.(opts);
}

export function EditFieldHost() {
  const [opts, setOpts] = useState<EditOptions | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    externalOpen = (o) => {
      setOpts(o);
      setText(o.value);
    };
    return () => {
      externalOpen = null;
    };
  }, []);

  const close = () => setOpts(null);
  const save = async () => {
    if (!opts) return;
    setSaving(true);
    try {
      await opts.onSave(text);
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!opts} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{opts?.title}</Text>
          <TextInput
            style={[styles.input, opts?.multiline && { height: 90, textAlignVertical: 'top' }]}
            value={text}
            onChangeText={setText}
            placeholder={opts?.placeholder}
            placeholderTextColor={colors.muted}
            multiline={opts?.multiline}
            keyboardType={opts?.numeric ? 'numeric' : 'default'}
            autoFocus
          />
          <View style={styles.actions}>
            <Pressable style={styles.btn} onPress={close}>
              <Text style={[styles.btnText, { color: colors.muted }]}>Cancelar</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={save} disabled={saving}>
              <Text style={[styles.btnText, { color: colors.white }]}>{saving ? 'Guardando…' : 'Guardar'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(30,20,40,0.45)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 380, backgroundColor: colors.white, borderRadius: radius.lg, padding: 22, boxShadow: cardShadow },
  title: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 14 },
  input: { backgroundColor: '#F7F5FA', borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
  btn: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: radius.md },
  btnPrimary: { backgroundColor: colors.brand },
  btnText: { fontSize: 15, fontWeight: '700' },
});
