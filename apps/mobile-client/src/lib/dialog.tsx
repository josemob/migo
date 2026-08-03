import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { cardShadow, colors, radius } from '../theme';

export interface DialogButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}
export interface DialogOptions {
  title: string;
  message?: string;
  buttons?: DialogButton[];
}

let externalShow: ((opts: DialogOptions) => void) | null = null;

/** Diálogo Migo, misma firma que Alert.alert — igual en Android e iOS. */
export function appAlert(title: string, message?: string, buttons?: DialogButton[]) {
  externalShow?.({ title, message, buttons });
}

/** Montar una vez en la raíz de la app. */
export function DialogHost() {
  const [opts, setOpts] = useState<DialogOptions | null>(null);

  useEffect(() => {
    externalShow = (o) => setOpts(o);
    return () => {
      externalShow = null;
    };
  }, []);

  const close = () => setOpts(null);
  const buttons = opts?.buttons?.length ? opts.buttons : [{ text: 'OK' } as DialogButton];
  const stacked = buttons.length > 2;

  return (
    <Modal visible={!!opts} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{opts?.title}</Text>
          {opts?.message ? <Text style={styles.message}>{opts.message}</Text> : null}
          <View style={[styles.actions, stacked && { flexDirection: 'column-reverse' }]}>
            {buttons.map((b, i) => (
              <Pressable
                key={i}
                style={[styles.btn, stacked && styles.btnStacked]}
                onPress={() => {
                  close();
                  b.onPress?.();
                }}
              >
                <Text
                  style={[
                    styles.btnText,
                    b.style === 'destructive' && { color: colors.red },
                    b.style === 'cancel' && { color: colors.muted },
                  ]}
                >
                  {b.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(30,20,40,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  card: { width: '100%', maxWidth: 360, backgroundColor: colors.white, borderRadius: radius.lg, padding: 22, boxShadow: cardShadow },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' },
  message: { fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 8, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: radius.md, alignItems: 'center', backgroundColor: '#F3EEF7' },
  btnStacked: { flex: 0 },
  btnText: { fontSize: 15, fontWeight: '700', color: colors.brand },
});
