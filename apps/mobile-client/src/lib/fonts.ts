import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
  Outfit_900Black,
} from '@expo-google-fonts/outfit';

// Fuentes a cargar con useFonts (una familia por peso, como requiere Android)
export const OUTFIT_FONTS = {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
  Outfit_900Black,
};

// El design system usa fontWeight (string/number) por toda la app.
// Android no sintetiza pesos desde una sola familia, así que mapeamos peso -> familia.
const WEIGHT_TO_FAMILY: Record<string, string> = {
  '100': 'Outfit_400Regular',
  '200': 'Outfit_400Regular',
  '300': 'Outfit_400Regular',
  '400': 'Outfit_400Regular',
  normal: 'Outfit_400Regular',
  '500': 'Outfit_500Medium',
  '600': 'Outfit_600SemiBold',
  '700': 'Outfit_700Bold',
  bold: 'Outfit_700Bold',
  '800': 'Outfit_800ExtraBold',
  '900': 'Outfit_900Black',
};

type FlatText = { fontWeight?: string | number; fontFamily?: string };

function familyFor(flat: FlatText): string {
  const w = flat.fontWeight != null ? String(flat.fontWeight) : '400';
  return WEIGHT_TO_FAMILY[w] ?? 'Outfit_400Regular';
}

// Tope global del tamaño de letra del sistema. Con "letra enorme" (2.0×) los botones y
// las etiquetas se partían en sílabas ("Director / io") o se cortaban. Hasta 1.3× la
// app sigue respetando la preferencia del usuario; por encima, se queda en 1.3×.
// Un componente puede pedir otro tope con su propio maxFontSizeMultiplier.
export const MAX_FONT_SCALE = 1.3;

type ThemedProps = { style?: unknown; maxFontSizeMultiplier?: number | null };
type AnyComp = React.ComponentType<ThemedProps> & { __outfit?: boolean; displayName?: string; name?: string };

function makeThemed(Orig: AnyComp): AnyComp {
  const Themed: AnyComp = (raw: ThemedProps) => {
    const props = raw.maxFontSizeMultiplier === undefined ? { ...raw, maxFontSizeMultiplier: MAX_FONT_SCALE } : raw;
    const flat = (StyleSheet.flatten(props.style as never) as FlatText) || {};
    // Si el estilo ya trae su propia familia, se respeta tal cual.
    if (flat.fontFamily) return React.createElement(Orig, props);
    // La familia va primero para que el estilo original conserve el resto de props.
    // En Android, familia de un solo peso + fontWeight 700 hace que RN busque la
    // variante "bold" de esa familia, no la encuentre y caiga a Roboto Bold:
    // el peso ya va en la familia, así que se neutraliza fontWeight.
    const style = [{ fontFamily: familyFor(flat) }, props.style, Platform.OS === 'android' && { fontWeight: 'normal' as const }];
    return React.createElement(Orig, { ...props, style });
  };
  Themed.__outfit = true;
  Themed.displayName = `Outfit(${Orig.displayName || Orig.name || 'Component'})`;
  return Themed;
}

let patched = false;

/**
 * Aplica Outfit a TODOS los <Text>/<TextInput> de la app.
 * RN 0.86 exporta Text/TextInput como getters configurables en el módulo
 * 'react-native'; los redefinimos para devolver una versión envuelta que
 * inyecta la familia Outfit correcta según el fontWeight de cada estilo.
 * Idempotente. Llamar una sola vez, tras cargar las fuentes.
 */
export function enableOutfit() {
  if (patched) return;
  patched = true;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RN = require('react-native') as Record<string, AnyComp>;
  for (const key of ['Text', 'TextInput']) {
    try {
      const Orig = RN[key];
      if (!Orig || Orig.__outfit) continue;
      const Themed = makeThemed(Orig);
      Object.defineProperty(RN, key, { configurable: true, enumerable: true, get: () => Themed });
    } catch {
      // Si el export no fuese redefinible, se cae a la fuente del sistema (sin crash).
    }
  }
}
