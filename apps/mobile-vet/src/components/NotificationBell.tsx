import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { TabIcon } from './TabIcon';
import { useUnreadCount } from '../lib/notifications';
import { colors } from '../theme';

/** Campana con globo rojo y el número de notificaciones sin leer ("9+" si son más). */
export function NotificationBell({ onPress, style }: { onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const count = useUnreadCount();
  const label = count > 9 ? '9+' : String(count);
  return (
    <Pressable
      style={style}
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={count ? `Notificaciones, ${count} sin leer` : 'Notificaciones'}
    >
      <TabIcon name="bell" color={colors.brand} size={24} />
      {count > 0 ? (
        <View style={[s.badge, label.length > 1 && s.badgeWide]}>
          <Text style={s.badgeTxt} maxFontSizeMultiplier={1.1}>{label}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  badge: {
    position: 'absolute', top: -5, right: -5, minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.white, paddingHorizontal: 4,
  },
  badgeWide: { minWidth: 26 },
  badgeTxt: { color: colors.white, fontSize: 11, fontWeight: '800', lineHeight: 13 },
});
