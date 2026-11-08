import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useUnreadCount } from '../lib/notifications';
import { colors, radius } from '../theme';

/**
 * Pill "Notificaciones" de la tarjeta de perfil del Inicio (junto a "Sin verificar"),
 * con el número de no leídas en rojo ("9+" si son más).
 */
export function NotificationPill({ onPress }: { onPress: () => void }) {
  const count = useUnreadCount();
  const label = count > 9 ? '9+' : String(count);
  return (
    <Pressable
      style={s.pill}
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={count ? `Notificaciones, ${count} sin leer` : 'Notificaciones'}
    >
      <Text style={s.txt} numberOfLines={1}>Notificaciones</Text>
      {count > 0 ? (
        <View style={s.badge}>
          <Text style={s.badgeTxt} maxFontSizeMultiplier={1.1}>{label}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  // flexShrink: en la fila única de pills, con letra grande se recorta en vez de saltar de línea
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1, backgroundColor: colors.white, borderRadius: radius.full, paddingLeft: 10, paddingRight: 6, paddingVertical: 5 },
  txt: { flexShrink: 1, color: colors.brand, fontWeight: '700', fontSize: 12 },
  badge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeTxt: { color: colors.white, fontSize: 11, fontWeight: '800', lineHeight: 13 },
});
