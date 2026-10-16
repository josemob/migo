import { randomInt } from 'node:crypto';

// Sin 0/O, 1/I/L ni U/V: el código va grabado en una placa de 25 mm y a veces
// hay que dictarlo por teléfono, así que no puede haber letras que se confundan.
// 29 símbolos ^ 6 posiciones = ~594 millones de códigos.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTWXYZ';
export const PUBLIC_CODE_LENGTH = 6;
export const PUBLIC_CODE_RE = new RegExp(`^[${ALPHABET}]{${PUBLIC_CODE_LENGTH}}$`);

export function newPublicCode(): string {
  let code = '';
  for (let i = 0; i < PUBLIC_CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** Normaliza lo que tipea quien encontró la placa: mayúsculas y sin espacios ni guiones. */
export function normalizePublicCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '');
}
