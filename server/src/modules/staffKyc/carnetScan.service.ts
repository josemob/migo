import { env } from '../../config/env';
import { VET_SPECIALTIES } from './specialties';

export interface CarnetScanResult {
  fullName: string | null;
  nationalId: string | null; // cédula
  collegiateNumber: string | null; // N° de colegiado (CMV)
  specialty: string | null; // normalizada a la taxonomía si aplica
  source: 'gemini' | 'unavailable';
}

const EMPTY: CarnetScanResult = {
  fullName: null,
  nationalId: null,
  collegiateNumber: null,
  specialty: null,
  source: 'unavailable',
};

/** Separa un data URI (`data:image/jpeg;base64,XXXX`) o base64 crudo en {mimeType, data}. */
function parseImage(image: string): { mimeType: string; data: string } | null {
  const m = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s);
  if (m && m[1] && m[2]) return { mimeType: m[1], data: m[2] };
  // base64 crudo sin encabezado -> asumimos JPEG
  if (image.length > 100) return { mimeType: 'image/jpeg', data: image };
  return null;
}

/**
 * Extrae los datos del carnet del Colegio de Médicos Veterinarios usando Gemini (visión).
 * NUNCA guarda nada: devuelve campos para que el veterinario los CONFIRME/edite en la app.
 * Si no hay API key o falla, devuelve campos vacíos (source: 'unavailable') para que el
 * flujo caiga al ingreso manual.
 */
export async function scanCarnet(image: string): Promise<CarnetScanResult> {
  const img = parseImage(image);
  if (!img) return EMPTY;
  if (!env.GEMINI_API_KEY) return EMPTY;

  const prompt = `Eres un asistente que lee el CARNET del Colegio de Médicos Veterinarios (CMV) de un veterinario.
Extrae SOLO lo que veas en la imagen. Si un dato no aparece, devuélvelo como null (no inventes).

Devuelve exactamente este JSON (sin markdown):
{"fullName": string|null, "nationalId": string|null, "collegiateNumber": string|null, "specialty": string|null}

Definiciones:
- fullName: nombre completo del profesional tal como aparece.
- nationalId: número de cédula / identificación, solo dígitos y guiones.
- collegiateNumber: número de colegiado / registro del CMV (ej. "CMV-1234" o el número que figure).
- specialty: especialidad SOLO si el carnet la indica explícitamente; si no aparece, null. Muchos carnets NO listan especialidad.
Si detectas una especialidad, normalízala (si encaja) a una de esta lista: ${VET_SPECIALTIES.join(', ')}.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: img.mimeType, data: img.data } },
            ],
          },
        ],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const parsed = JSON.parse(text) as Partial<Record<'fullName' | 'nationalId' | 'collegiateNumber' | 'specialty', string | null>>;

  const clean = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s && s.toLowerCase() !== 'null' ? s : null;
  };
  return {
    fullName: clean(parsed.fullName),
    nationalId: clean(parsed.nationalId),
    collegiateNumber: clean(parsed.collegiateNumber),
    specialty: clean(parsed.specialty),
    source: 'gemini',
  };
}
