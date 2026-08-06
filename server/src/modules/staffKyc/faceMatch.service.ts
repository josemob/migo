// Face-match del KYC de staff usando @vladmandic/face-api (opcional).
// Compara la cara de la selfie con la cara impresa en la cédula.
//
// Mientras la librería nativa no esté instalada (o falle en Windows),
// esta función devuelve null y el KYC cae a REVISIÓN MANUAL en el Super Admin.
// Cuando se instale, aquí se enchufa la comparación real.

export interface FaceMatchResult {
  score: number; // distancia euclidiana entre descriptores (menor = más parecido)
  passed: boolean; // score < UMBRAL
}

// Umbral típico de face-api para "misma persona" (distancia). ~0.5-0.6.
export const FACE_MATCH_THRESHOLD = 0.55;

let engine: 'unavailable' | 'ready' = 'unavailable';

/**
 * Compara dos imágenes (data URI o base64) y devuelve un score de similitud.
 * Devuelve null si el motor no está disponible -> el flujo usa revisión manual.
 */
export async function matchFaces(selfie?: string | null, idDoc?: string | null): Promise<FaceMatchResult | null> {
  if (!selfie || !idDoc) return null;
  if (engine === 'unavailable') return null; // face-api aún no instalado; fallback manual
  try {
    // TODO(face-api): cargar modelos, detectar y comparar descriptores.
    // const d = euclideanDistance(descSelfie, descCedula);
    // return { score: d, passed: d < FACE_MATCH_THRESHOLD };
    return null;
  } catch {
    return null;
  }
}
