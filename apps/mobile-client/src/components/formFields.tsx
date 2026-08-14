import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, radius, spacing } from '../theme';

// Iconos ojo / ojo tachado (flat, un color)
const EYE =
  'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z';
const EYE_OFF =
  'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z';

/**
 * Input de contraseña con icono de ojo flat para mostrar/ocultar, y "revelado":
 * al escribir con la contraseña oculta, el último carácter se ve por ~0.5s y luego
 * se enmascara. Enmascaramos manualmente (sin secureTextEntry) para lograrlo.
 */
export function PasswordInput({
  label,
  value = '',
  onChangeText,
  ...rest
}: TextInputProps & { label?: string }) {
  const real = (value as string) ?? '';
  const [visible, setVisible] = useState(false);
  const [display, setDisplay] = useState('•'.repeat(real.length));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (text: string) => {
    if (visible) {
      onChangeText?.(text);
      setDisplay('•'.repeat(text.length));
      return;
    }
    if (text.length >= real.length) {
      const added = text.slice(real.length); // caracteres nuevos escritos tras los puntos
      const newReal = real + added;
      onChangeText?.(newReal);
      const last = newReal.slice(-1);
      setDisplay('•'.repeat(Math.max(0, newReal.length - 1)) + last);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setDisplay('•'.repeat(newReal.length)), 500);
    } else {
      const newReal = real.slice(0, text.length);
      onChangeText?.(newReal);
      setDisplay('•'.repeat(newReal.length));
    }
  };

  const toggle = () => {
    setVisible((v) => {
      if (v) setDisplay('•'.repeat(real.length)); // al ocultar, re-enmascara
      return !v;
    });
    if (timer.current) clearTimeout(timer.current);
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.row}>
        <TextInput
          {...rest}
          value={visible ? real : display}
          onChangeText={handleChange}
          secureTextEntry={false}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={colors.muted}
          style={styles.inputFlex}
        />
        <Pressable onPress={toggle} hitSlop={10} style={styles.eyeBtn} accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill={colors.muted}>
            <Path d={visible ? EYE_OFF : EYE} />
          </Svg>
        </Pressable>
      </View>
    </View>
  );
}

// Operadoras móviles de Venezuela
const OPERATORS: { code: string; name: string }[] = [
  { code: '0412', name: 'Digitel' },
  { code: '0414', name: 'Movistar' },
  { code: '0416', name: 'Movilnet' },
  { code: '0424', name: 'Movistar' },
  { code: '0426', name: 'Movilnet' },
];

/**
 * Teléfono dividido: a la izquierda un selector de operadora venezolana y a la
 * derecha el input de 7 dígitos. El valor combinado es `<operadora><7 dígitos>`.
 */
export function PhoneInput({
  label,
  value = '',
  onChangeText,
}: {
  label?: string;
  value?: string;
  onChangeText?: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const op = OPERATORS.find((o) => value.startsWith(o.code))?.code ?? OPERATORS[0].code;
  const digits = value.startsWith(op) ? value.slice(op.length) : value.replace(/\D/g, '');

  const emit = (newOp: string, newDigits: string) =>
    onChangeText?.(newOp + newDigits.replace(/\D/g, '').slice(0, 7));

  return (
    <View style={{ marginBottom: spacing.md }}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.phoneRow}>
        <Pressable style={styles.opBtn} onPress={() => setOpen(true)}>
          <Text style={styles.opText}>{op}</Text>
          <Text style={styles.opChevron}>⌄</Text>
        </Pressable>
        <TextInput
          style={styles.phoneInput}
          value={digits}
          onChangeText={(t) => emit(op, t)}
          keyboardType="number-pad"
          maxLength={7}
          placeholder="1234567"
          placeholderTextColor={colors.muted}
        />
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.opSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.opSheetTitle}>Operadora</Text>
            {OPERATORS.map((o) => (
              <Pressable
                key={o.code}
                style={styles.opRow}
                onPress={() => {
                  emit(o.code, digits);
                  setOpen(false);
                }}
              >
                <Text style={styles.opRowCode}>{o.code}</Text>
                <Text style={styles.opRowName}>{o.name}</Text>
                {o.code === op && <Text style={styles.opCheck}>✓</Text>}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingRight: 12,
  },
  inputFlex: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text },
  eyeBtn: { padding: 4 },

  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  opBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  opText: { fontSize: 16, color: colors.text, fontWeight: '600' },
  opChevron: { fontSize: 16, color: colors.muted },
  phoneInput: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    letterSpacing: 1,
  },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 32 },
  opSheet: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 12 },
  opSheetTitle: { fontSize: 14, fontWeight: '700', color: colors.muted, paddingHorizontal: 8, paddingVertical: 6 },
  opRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 14 },
  opRowCode: { fontSize: 16, fontWeight: '800', color: colors.text, width: 56 },
  opRowName: { flex: 1, fontSize: 15, color: colors.muted },
  opCheck: { fontSize: 18, fontWeight: '900', color: colors.brand },
});
