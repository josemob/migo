import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * Botón de volver atrás estándar (Figma):
 * fondo blanco · radio 8 · borde 1px #E5E7EB · flecha (chevron) 2px #1F2937.
 */
export function BackButton({ onPress, style }: { onPress: () => void; style?: ViewStyle }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }, style]}>
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
        <Path d="M15 18L9 12L15 6" stroke="#1F2937" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
