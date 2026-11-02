import { env } from '../config/env';

// Modelos a probar en orden. Si el principal está saturado (503 "high demand") o con
// rate-limit (429), se pasa al siguiente antes de rendirse: flash-lite casi siempre
// responde cuando flash está saturado, y así el chat no cae al texto genérico.
const FALLBACK_MODELS = ['gemini-flash-lite-latest'];

export function geminiModels(): string[] {
  return [...new Set([env.GEMINI_MODEL, ...FALLBACK_MODELS])];
}

type GeminiResponse = { candidates?: { content?: { parts?: { text?: string }[] } }[] };

/**
 * Llama a generateContent con la cadena de modelos. Por modelo: hasta `attempts`
 * intentos ante 503/429 (transitorios); cualquier otro error HTTP pasa al siguiente
 * modelo. Devuelve el texto concatenado de la respuesta (lanza si nadie respondió).
 */
export async function geminiGenerate(
  body: Record<string, unknown>,
  opts: { timeoutMs?: number; attempts?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 20000;
  const attempts = opts.attempts ?? 2;
  const json = JSON.stringify(body);
  let lastErr = 'sin modelos';

  for (const model of geminiModels()) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 900 * attempt));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json, signal: controller.signal });
      } catch (e) {
        lastErr = `${model}: ${(e as Error).name === 'AbortError' ? 'timeout' : (e as Error).message}`;
        break; // timeout/red → siguiente modelo
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 503 || res.status === 429) { lastErr = `${model}: HTTP ${res.status}`; continue; }
      if (!res.ok) { lastErr = `${model}: HTTP ${res.status}`; break; }
      const data = (await res.json()) as GeminiResponse;
      const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
      if (!text) { lastErr = `${model}: sin texto`; break; }
      if (model !== env.GEMINI_MODEL) console.warn(`[gemini] respondió el modelo de respaldo ${model}`);
      return text;
    }
  }
  throw new Error(`Gemini no disponible (${lastErr})`);
}
