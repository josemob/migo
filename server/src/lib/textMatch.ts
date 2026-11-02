// Detección de palabras clave que respeta negaciones simples del español:
// "no ha vomitado", "sin sangre", "ni tiene diarrea" NO cuentan como menciones.
// La negación se busca solo dentro de la misma frase/cláusula (hasta la última
// puntuación o "y"/"pero"), para que "no come y vomita" sí cuente "vomita".
const NEGATION = /\b(no|sin|nunca|ni|tampoco|jam[aá]s)\b/;
const CLAUSE_BREAK = /[.,;:!?\n]|\s(?:y|e|pero|aunque|porque)\s/g;

function negatedAt(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 40), index);
  let start = 0;
  for (const m of before.matchAll(CLAUSE_BREAK)) start = (m.index ?? 0) + m[0].length;
  return NEGATION.test(before.slice(start));
}

/** ¿`text` (ya en minúsculas) menciona `kw` de forma afirmativa al menos una vez? */
export function mentions(text: string, kw: string): boolean {
  // Las claves que ya son negativas ("no come", "no respira") se buscan tal cual.
  if (/^(no|sin)\s/.test(kw)) return text.includes(kw);
  for (let i = text.indexOf(kw); i >= 0; i = text.indexOf(kw, i + 1)) {
    if (!negatedAt(text, i)) return true;
  }
  return false;
}

export function mentionsAny(text: string, kws: readonly string[]): boolean {
  return kws.some((k) => mentions(text, k));
}
