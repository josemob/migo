import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cardShadow, colors, control, radius, spacing, type } from '../theme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={styles.scroll}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}
export function H2({ children }: { children: ReactNode }) {
  return <Text style={styles.h2}>{children}</Text>;
}
export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonVariant = 'primary' | 'outline' | 'danger' | 'dangerOutline' | 'green';

const VARIANTS: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.brand, fg: colors.white, border: 'transparent' },
  green: { bg: colors.green, fg: colors.white, border: 'transparent' },
  danger: { bg: colors.red, fg: colors.white, border: 'transparent' },
  outline: { bg: colors.white, fg: colors.brand, border: colors.brand },
  dangerOutline: { bg: colors.white, fg: colors.red, border: colors.red },
};

type ButtonSize = 'lg' | 'md';

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  style?: object;
}) {
  const v = VARIANTS[variant];
  // medium (design system): alto 32 · radio 8 · texto h4
  const isMd = size === 'md';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        isMd && { height: control.medium.height, borderRadius: control.medium.radius, paddingHorizontal: spacing.md },
        {
          backgroundColor: v.bg,
          borderColor: v.border,
          borderWidth: v.border === 'transparent' ? 0 : 1.5,
          opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} size={isMd ? 'small' : undefined} />
      ) : (
        <Text style={[isMd ? styles.btnTextMd : styles.btnText, { color: v.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

// Pill / botón pill (design system): alto 26 · radio 13 · texto body small
export function Pill({
  label,
  color = colors.brand,
  onPress,
  filled = false,
  tint,
}: {
  label: string;
  color?: string;
  onPress?: () => void;
  filled?: boolean;
  tint?: string;
}) {
  const bg = filled ? color : tint ?? color + '1F';
  const fg = filled ? colors.white : color;
  const inner = <Text style={[styles.pillText, { color: fg }]}>{label}</Text>;
  const pillStyle = [styles.pill, { backgroundColor: bg }];
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [...pillStyle, { opacity: pressed ? 0.85 : 1 }]}>
      {inner}
    </Pressable>
  ) : (
    <View style={pillStyle}>{inner}</View>
  );
}

export function Input(props: TextInputProps & { label?: string }) {
  const { label, ...rest } = props;
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        placeholderTextColor={colors.muted}
        {...rest}
        style={[styles.input, props.multiline && { height: 90, textAlignVertical: 'top' }]}
      />
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}

export function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '22' }]}>
      <Text style={[styles.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  scroll: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 26, fontWeight: '800', color: colors.text },
  h2: { fontSize: 18, fontWeight: '700', color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    boxShadow: cardShadow,
  },
  btn: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  btnText: { fontSize: 16, fontWeight: '800' },
  btnTextMd: { ...type.h4 },
  pill: {
    borderRadius: control.pill.radius,
    paddingHorizontal: 12,
    paddingVertical: control.pill.paddingV,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  pillText: { ...type.bodySmall },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  // Badge = pill compacto para etiquetas/estados (IA, urgencia): menos padding horizontal.
  badge: {
    paddingHorizontal: 12,
    paddingVertical: control.pill.paddingV,
    borderRadius: control.pill.radius,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  badgeText: { ...type.bodySmall },
});
