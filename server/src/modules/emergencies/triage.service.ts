import type { TriageLevel } from '@prisma/client';
import { env } from '../../config/env';
import { VET_SPECIALTIES } from '../staffKyc/specialties';

export interface TriageResult {
  triageLevel: TriageLevel;
  aiSummary: string;
  aiFirstAid: string;
  // Especialidad sugerida (taxonomía cerrada) para rutear a vets independientes; null = general
  requiredSpecialty: string | null;
  source: 'gemini' | 'heuristic';
}

interface TriageInput {
  species: string;
  breed?: string | null;
  symptoms: string;
  ageYears?: number | null;
  knownAllergies?: string[];
  conditions?: string[];
}

/**
 * Triaje de urgencia veterinaria. Usa Gemini si hay API key configurada;
 * si no, cae a una heurística por palabras clave para no bloquear el flujo.
 */
export async function runTriage(input: TriageInput): Promise<TriageResult> {
  if (env.GEMINI_API_KEY) {
    try {
      return await triageWithGemini(input);
    } catch (err) {
      console.error('Gemini triage falló, usando heurística:', (err as Error).message);
    }
  }
  return heuristicTriage(input);
}

// ─── Gemini ───────────────────────────────────────────────
async function triageWithGemini(input: TriageInput): Promise<TriageResult> {
  const prompt = `Eres Migo AI, asistente de triaje veterinario de urgencias. Analiza el caso y responde SOLO con un JSON válido, sin markdown.

Paciente: ${input.species}${input.breed ? ` (${input.breed})` : ''}${input.ageYears ? `, ${input.ageYears} años` : ''}
Alergias conocidas: ${input.knownAllergies?.join(', ') || 'ninguna'}
Condiciones preexistentes: ${input.conditions?.join(', ') || 'ninguna'}
Síntomas reportados: "${input.symptoms}"

Devuelve exactamente este formato:
{"triageLevel":"RED|ORANGE|YELLOW|GREEN","aiSummary":"resumen clínico en 1 frase","aiFirstAid":"primeros auxilios concretos para el dueño mientras traslada, 1-2 frases","requiredSpecialty":"una de la lista o null"}

Criterio: RED = riesgo vital inmediato (dificultad respiratoria, convulsiones, hemorragia, trauma grave, intoxicación). ORANGE = urgente. YELLOW = atención pronta. GREEN = orientación, no urgente.
requiredSpecialty: la especialidad veterinaria más adecuada para este caso, EXACTAMENTE una de: ${VET_SPECIALTIES.join(', ')}. Si no aplica una específica o es general, usa null.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  // Timeout duro: si Gemini tarda, abortamos y caemos a la heurística (no colgar la urgencia).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const parsed = JSON.parse(text) as Omit<TriageResult, 'source'>;
  const level = (['RED', 'ORANGE', 'YELLOW', 'GREEN'] as const).includes(parsed.triageLevel)
    ? parsed.triageLevel
    : 'ORANGE';
  // Solo aceptamos una especialidad que exista en la taxonomía cerrada.
  const specialty =
    parsed.requiredSpecialty && (VET_SPECIALTIES as readonly string[]).includes(parsed.requiredSpecialty)
      ? parsed.requiredSpecialty
      : null;
  return {
    triageLevel: level,
    aiSummary: parsed.aiSummary ?? input.symptoms,
    aiFirstAid: parsed.aiFirstAid ?? 'Mantén al paciente calmado y trasládalo de inmediato.',
    requiredSpecialty: specialty,
    source: 'gemini',
  };
}

// ─── Heurística de respaldo ───────────────────────────────
const RED = ['no respira', 'respirac', 'ahog', 'convuls', 'sangr', 'hemorrag', 'atropell', 'trauma', 'veneno', 'intoxic', 'inconsc', 'colaps', 'obstrucc', 'asfixia'];
const ORANGE = ['vómito con sangre', 'no come', 'no puede', 'dolor intenso', 'hinchaz', 'fractura', 'cojea mucho', 'temperatura muy'];
const YELLOW = ['vómit', 'diarrea', 'fiebre', 'cojea', 'decaíd', 'no quiere comer', 'letárg'];

function heuristicTriage(input: TriageInput): TriageResult {
  const s = input.symptoms.toLowerCase();
  let level: TriageLevel = 'GREEN';
  if (RED.some((k) => s.includes(k))) level = 'RED';
  else if (ORANGE.some((k) => s.includes(k))) level = 'ORANGE';
  else if (YELLOW.some((k) => s.includes(k))) level = 'YELLOW';

  const firstAid: Record<TriageLevel, string> = {
    RED: 'Mantén las vías aéreas despejadas, no induzcas el vómito y traslada de inmediato a la clínica más cercana.',
    ORANGE: 'Mantén al paciente abrigado y en reposo; evita darle comida o agua hasta la valoración.',
    YELLOW: 'Ofrece agua en pequeñas cantidades, observa la evolución y acude a consulta pronto.',
    GREEN: 'Observa a tu mascota y agenda una consulta de orientación si los síntomas persisten.',
  };

  return {
    triageLevel: level,
    aiSummary: input.symptoms,
    aiFirstAid: firstAid[level],
    requiredSpecialty: null, // sin IA no inferimos especialidad → se rutea a todos
    source: 'heuristic',
  };
}
