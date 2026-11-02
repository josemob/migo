import { env } from '../../config/env';
import { geminiGenerate } from '../../lib/gemini';
import { mentions, mentionsAny } from '../../lib/textMatch';
import type { ChatTurn } from './aiChat.service';

// Estructura exacta solicitada para el resumen del chat con Migo AI
export interface PetChatSummary {
  consultation_reason: string;
  symptoms: string[];
  duration_of_symptoms: string | null;
  perceived_urgency_level: 'CRITICA' | 'MODERADA' | 'BAJA';
  possible_triggers: string | null;
  first_aid_given: string[];
  recommended_action: string;
  key_observations_for_vet: string;
}

interface SummaryInput {
  messages: ChatTurn[];
  pet?: { name?: string | null; species?: string | null; breed?: string | null } | null;
}

// Esquema JSON que fuerza a Gemini a devolver la estructura exacta (Structured Output)
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    consultation_reason: { type: 'STRING', description: 'Motivo en 2 a 6 palabras, como título (ej. "Vómito y decaimiento"). Nunca copies el mensaje del dueño.' },
    symptoms: { type: 'ARRAY', items: { type: 'STRING' } },
    duration_of_symptoms: { type: 'STRING', nullable: true },
    perceived_urgency_level: { type: 'STRING', enum: ['CRITICA', 'MODERADA', 'BAJA'] },
    possible_triggers: { type: 'STRING', nullable: true },
    first_aid_given: { type: 'ARRAY', items: { type: 'STRING' } },
    recommended_action: { type: 'STRING' },
    key_observations_for_vet: { type: 'STRING' },
  },
  required: [
    'consultation_reason', 'symptoms', 'perceived_urgency_level',
    'first_aid_given', 'recommended_action', 'key_observations_for_vet',
  ],
} as const;

const URGENCIES = ['CRITICA', 'MODERADA', 'BAJA'] as const;

/**
 * Extrae un resumen clínico estructurado de la conversación con Migo AI.
 * Usa Gemini con responseSchema si hay API key; si no, cae a una extracción heurística.
 */
export async function extractChatSummary(
  input: SummaryInput,
): Promise<{ summary: PetChatSummary; source: 'gemini' | 'fallback' }> {
  if (env.GEMINI_API_KEY) {
    try {
      return { summary: await geminiExtract(input), source: 'gemini' };
    } catch (err) {
      console.error('Gemini summary falló, usando fallback:', (err as Error).message);
    }
  }
  return { summary: heuristicExtract(input), source: 'fallback' };
}

// ─── Gemini (Structured Output) ───────────────────────────
async function geminiExtract(input: SummaryInput): Promise<PetChatSummary> {
  const transcript = input.messages
    .map((m) => `${m.role === 'user' ? 'DUEÑO' : 'MIGO AI'}: ${m.text}`)
    .join('\n');
  const p = input.pet;
  const petLine = p?.name ? `Mascota: ${p.name}${p.species ? ` (${p.species}${p.breed ? `, ${p.breed}` : ''})` : ''}\n` : '';

  const prompt = `Eres un extractor clínico veterinario. A partir de la siguiente conversación entre un dueño de mascota y Migo AI, extrae un resumen estructurado para que un veterinario lo revise. Responde SOLO con el JSON del esquema.
Reglas:
- "symptoms": lista de síntomas concretos mencionados (vacía si no hay).
- "duration_of_symptoms": desde cuándo ocurren (ej. "desde esta mañana"); null si no se menciona.
- "perceived_urgency_level": CRITICA (riesgo vital: dificultad respiratoria, convulsiones, sangrado, intoxicación, trauma), MODERADA (requiere atención pronta) o BAJA (orientación).
- "possible_triggers": posible causa/desencadenante mencionado; null si no.
- "first_aid_given": primeros auxilios o recomendaciones de cuidado que Migo AI dio en el chat (vacía si no dio).
- "recommended_action": la acción recomendada más importante para el dueño.
- "key_observations_for_vet": nota breve y útil para el veterinario.

${petLine}Conversación:
${transcript}`;

  // maxOutputTokens alto: los modelos flash nuevos gastan tokens en "pensamiento"
  const text = await geminiGenerate({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
  });
  return normalize(JSON.parse(text));
}

// Sanea/valida el objeto para garantizar el contrato aunque el modelo desvíe
function normalize(raw: Partial<PetChatSummary>): PetChatSummary {
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const str = (v: unknown, d = ''): string => (typeof v === 'string' && v.trim() ? v.trim() : d);
  const nullable = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const urgency = URGENCIES.includes(raw.perceived_urgency_level as (typeof URGENCIES)[number])
    ? (raw.perceived_urgency_level as PetChatSummary['perceived_urgency_level'])
    : 'MODERADA';
  return {
    consultation_reason: clampTitle(str(raw.consultation_reason, 'Consulta general')),
    symptoms: arr(raw.symptoms),
    duration_of_symptoms: nullable(raw.duration_of_symptoms),
    perceived_urgency_level: urgency,
    possible_triggers: nullable(raw.possible_triggers),
    first_aid_given: arr(raw.first_aid_given),
    recommended_action: str(raw.recommended_action, 'Consulta veterinaria recomendada.'),
    key_observations_for_vet: str(raw.key_observations_for_vet, 'Sin observaciones adicionales.'),
  };
}

// ─── Fallback heurístico (sin API key) ────────────────────
const RED = ['no respira', 'respirac', 'ahog', 'convuls', 'sangr', 'hemorrag', 'veneno', 'intoxic', 'atropell', 'inconsc', 'colaps', 'asfixia'];
const ORANGE = ['vómit', 'vomit', 'diarrea', 'fiebre', 'no come', 'decaíd', 'dolor', 'cojea', 'hinchaz'];
const SYMPTOM_WORDS = ['vómito', 'vomito', 'diarrea', 'fiebre', 'tos', 'decaído', 'decaimiento', 'dolor', 'cojera', 'rasca', 'picazón', 'enrojecimiento', 'hinchazón', 'sangrado', 'convulsión', 'letargo', 'no come', 'no bebe'];

function heuristicExtract(input: SummaryInput): PetChatSummary {
  const userText = input.messages.filter((m) => m.role === 'user').map((m) => m.text).join(' ');
  const aiText = input.messages.filter((m) => m.role === 'assistant').map((m) => m.text).join(' ');
  const low = userText.toLowerCase();

  const symptoms = SYMPTOM_WORDS.filter((w) => mentions(low, w));
  const urgency: PetChatSummary['perceived_urgency_level'] =
    mentionsAny(low, RED) ? 'CRITICA' : mentionsAny(low, ORANGE) ? 'MODERADA' : 'BAJA';

  const durMatch = low.match(/(desde|hace|por)\s+[^.,;]{2,40}/);

  return {
    consultation_reason: shortReason(symptoms, urgency),
    symptoms: [...new Set(symptoms)],
    duration_of_symptoms: durMatch ? durMatch[0] : null,
    perceived_urgency_level: urgency,
    possible_triggers: null,
    first_aid_given: aiText ? [aiText.slice(0, 220)] : [],
    recommended_action:
      urgency === 'CRITICA'
        ? 'Acudir de inmediato a una clínica veterinaria o activar la Alerta de emergencia.'
        : urgency === 'MODERADA'
          ? 'Agendar una consulta veterinaria pronto.'
          : 'Observar la evolución y consultar si los síntomas persisten.',
    key_observations_for_vet: userText.slice(0, 300) || 'Interacción con Migo AI sin detalles clínicos.',
  };
}

// Título corto para el calendario/expediente (antes se usaba el mensaje crudo del dueño).
function shortReason(symptoms: string[], urgency: PetChatSummary['perceived_urgency_level']): string {
  const uniq = [...new Set(symptoms.map((w) => w.replace('vomito', 'vómito')))].slice(0, 2);
  if (uniq.length) {
    const list = uniq.join(' y ');
    return list.charAt(0).toUpperCase() + list.slice(1);
  }
  return urgency === 'CRITICA' ? 'Posible urgencia' : 'Consulta veterinaria sugerida';
}

// Tope de largo por si el modelo devuelve una frase larga.
function clampTitle(t: string): string {
  const one = t.split(/[.\n]/)[0]!.trim();
  return one.length > 48 ? one.slice(0, 47).trimEnd() + '…' : one;
}
