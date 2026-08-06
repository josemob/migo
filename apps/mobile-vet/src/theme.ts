// Design system Migo (mismo que el Vet Dashboard)
export const colors = {
  brand: '#8A2FA0',
  brandDark: '#6E2681',
  brandDeep: '#3B1446',
  brandLight: '#F5EBFA',
  accent: '#F6DE1E',
  green: '#2EA84F',
  amber: '#F5A013',
  red: '#EA4B4B',
  redDark: '#C0392B',
  canvas: '#F6F7F9',
  card: '#FFFFFF',
  text: '#1E293B',
  muted: '#64748B',
  border: '#E2E8F0',
  white: '#FFFFFF',
};

// Colores por nivel de triaje
export const triageColor: Record<string, string> = {
  RED: '#EA4B4B',
  ORANGE: '#F5A013',
  YELLOW: '#EAB308',
  GREEN: '#2EA84F',
};

export const triageLabel: Record<string, string> = {
  RED: 'CRÍTICO',
  ORANGE: 'URGENTE',
  YELLOW: 'ATENCIÓN PRONTA',
  GREEN: 'ORIENTACIÓN',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 13, full: 999 };

// Escala tipográfica del design system (Figma)
// h4 (Outfit Medium): 16px / 18px / peso 500 / letter-spacing 0  -> títulos de botón medium
// body small (Outfit Regular): 14px / peso 400  -> pills, chips y textos secundarios
export const type = {
  h4: { fontSize: 16, lineHeight: 18, fontWeight: '500' as const, letterSpacing: 0 },
  bodySmall: { fontSize: 14, lineHeight: 18, fontWeight: '400' as const },
};

// Proporciones estándar de controles (Figma)
// Botón medium: alto 32 · radio 8 · texto h4
// Pill / botón pill: padding 24/4 · radio 27 (cápsula) · texto body small (alto efectivo ~26)
export const control = {
  medium: { height: 32, radius: radius.sm },
  pill: { radius: 27, paddingH: 24, paddingV: 4 },
};

// Sombra de tarjetas (design system): X2 Y2 · blur 21 · spread 0 · #7F398A 10%
export const cardShadow = '2px 2px 21px 0px rgba(127, 57, 138, 0.1)';
