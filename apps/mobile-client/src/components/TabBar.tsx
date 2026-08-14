import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { MigoTabIcon } from './MigoTabIcon';
import { colors } from '../theme';

const ICONS: Record<string, string> = {
  Home: 'home',
  Directorio: 'directory',
  Chats: 'chat',
  Citas: 'citas',
};
const INACTIVE = '#C7C7C7';

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  // El botón central "Alerta" ES la pestaña en el índice 2
  const left = state.routes.slice(0, 2);
  const alerta = state.routes[2];
  const right = state.routes.slice(3);

  const renderTab = (route: (typeof state.routes)[number], index: number) => {
    const focused = state.index === index;
    const color = focused ? colors.brand : INACTIVE;
    return (
      <Pressable
        key={route.key}
        style={styles.tab}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            // Al entrar por la pestaña Directorio se muestran TODAS (limpia el filtro por servicio)
            navigation.navigate(route.name, route.name === 'Directorio' ? { category: null } : undefined);
          }
        }}
      >
        <MigoTabIcon name={ICONS[route.name] ?? 'home'} color={color} size={24} />
        <Text style={[styles.label, { color }]}>{route.name}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom || 8 }]}>
      {left.map((r, i) => renderTab(r, i))}

      {/* Botón central Alerta (pestaña de urgencias cercanas).
          El botón va absoluto (elevado) y un spacer del tamaño del icono mantiene
          el label alineado con los demás títulos. */}
      <View style={styles.centerSlot}>
        <View style={styles.alertIconSpace} />
        <Text style={styles.alertLabel}>Alerta</Text>
        <Pressable style={styles.alertBtn} onPress={() => navigation.navigate(alerta!.name)}>
          <MigoTabIcon name="paw" color={colors.white} size={30} />
        </Pressable>
      </View>

      {right.map((r, i) => renderTab(r, i + 3))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0ECF3',
    alignItems: 'flex-start',
  },
  tab: { flex: 1, alignItems: 'center', gap: 12 },
  label: { fontSize: 11, fontWeight: '600' },
  centerSlot: { flex: 1, alignItems: 'center', gap: 12 },
  alertIconSpace: { width: 24, height: 24 },
  alertBtn: {
    position: 'absolute',
    top: -34,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    borderColor: colors.white,
    elevation: 4,
  },
  alertLabel: { fontSize: 11, fontWeight: '700', color: colors.brand },
});
