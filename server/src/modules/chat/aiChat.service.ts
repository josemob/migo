import { env } from '../../config/env';

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

interface AiChatInput {
  messages: ChatTurn[];
  pet?: { name?: string | null; species?: string | null; breed?: string | null } | null;
  ownerName?: string | null;
}

const SPECIES_ES: Record<string, string> = {
  DOG: 'perro', CAT: 'gato', BIRD: 'ave', RABBIT: 'conejo', REPTILE: 'reptil', RODENT: 'roedor', OTHER: 'mascota',
};

/**
 * Migo IA — asistente veterinario conversacional.
 * Usa Gemini si hay API key; si no, cae a respuestas heurísticas para no bloquear el chat.
 */
export async function migoAiReply(input: AiChatInput): Promise<{ text: string; source: 'gemini' | 'fallback' }> {
  if (env.GEMINI_API_KEY) {
    try {
      return { text: await geminiChat(input), source: 'gemini' };
    } catch (err) {
      console.error('Gemini chat falló, usando fallback:', (err as Error).message);
    }
  }
  return { text: fallbackReply(input), source: 'fallback' };
}

// ─── Gemini ───────────────────────────────────────────────
async function geminiChat(input: AiChatInput): Promise<string> {
  const p = input.pet;
  const petDesc = p?.name
    ? ` Ayudas con la mascota ${p.name}${p.species ? ` (${SPECIES_ES[p.species] ?? 'mascota'}${p.breed ? `, ${p.breed}` : ''})` : ''}.`
    : '';
  const system = `Eres "Migo IA", la asistente veterinaria de la app Migo (Venezuela).${petDesc} Te diriges a ${input.ownerName || 'el dueño'} por su nombre cuando sea natural.
Responde SIEMPRE en español, cálida, empática y clara, en 2 a 4 frases. Ofrece orientación general y primeros auxilios prácticos, pero NUNCA des un diagnóstico definitivo ni recetes medicamentos específicos con dosis. Recomienda evaluación profesional cuando corresponda.
Si detectas señales de urgencia (dificultad para respirar, convulsiones, sangrado abundante, intoxicación, trauma grave, inconsciencia), dilo con claridad y sugiere activar la "Alerta de emergencia" en Migo o acudir de inmediato a una clínica. Usa emojis con moderación.`;

  const contents = input.messages
    .slice(-12)
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents,
      // Presupuesto alto: los modelos flash nuevos gastan tokens en "pensamiento";
      // con poco margen la respuesta visible se corta (finishReason MAX_TOKENS).
      generationConfig: { temperature: 0.6, maxOutputTokens: 1200 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
  if (!text) throw new Error('Gemini sin texto');
  return text;
}

// ─── Fallback heurístico (sin API key) ────────────────────
function fallbackReply(input: AiChatInput): string {
  const last = [...input.messages].reverse().find((m) => m.role === 'user')?.text.toLowerCase() ?? '';
  const has = (arr: string[]) => arr.some((k) => last.includes(k));

  if (has(['no respira', 'respirac', 'ahog', 'convuls', 'sangr', 'hemorrag', 'veneno', 'intoxic', 'atropell', 'inconsc', 'colaps'])) {
    return '⚠️ Esto puede ser una urgencia. Mantén a tu mascota calmada y en un lugar seguro, y activa la *Alerta de emergencia* en Migo o acude de inmediato a la clínica más cercana. Puedo guiarte mientras tanto. 🐾';
  }
  if (has(['vómit', 'vomit'])) {
    return 'El vómito suele deberse a estómago vacío (bilis) o una gastritis leve. 💡 Retira la comida por unas horas y ofrece agua en sorbos pequeños. Si continúa, hay sangre o notas mucho decaimiento, conviene una consulta pronto.';
  }
  if (has(['diarrea'])) {
    return 'Para una diarrea leve, mantén a tu mascota hidratada y con dieta blanda (pollo y arroz). Si dura más de 24 h, hay sangre o decaimiento, agenda una consulta veterinaria. 🐾';
  }
  if (has(['vacun', 'desparasit'])) {
    return 'Con gusto. Puedes revisar el esquema de vacunas en el Expediente de tu mascota y agendar la aplicación desde el Directorio. ¿Quieres que te ayude a encontrar una clínica cercana?';
  }
  if (has(['garrapat', 'pulga', 'piel', 'rasca', 'alergia'])) {
    return 'Los problemas de piel y parásitos externos son comunes. Revisa si hay enrojecimiento o pulgas/garrapatas y evita que se lastime rascándose. Una consulta de estética o dermatológica ayuda a resolverlo. 🧴';
  }
  if (has(['hola', 'buenas', 'ayuda']) || last.length < 4) {
    return '¡Hola! 👋 Soy Migo IA. Cuéntame qué síntomas notas en tu mascota (desde cuándo, si come y bebe, su ánimo) y con gusto te oriento.';
  }
  return 'Gracias por contarme. Para orientarte mejor, descríbeme los síntomas: desde cuándo ocurren, si tu mascota come y bebe, y cómo está su ánimo. Ante cualquier señal grave, recuerda que puedes activar la *Alerta de emergencia* en Migo. 🐾';
}
