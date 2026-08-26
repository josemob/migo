import { env } from '../../config/env';
import { prisma } from '../../config/prisma';

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

// Reglas y conocimiento configurados por el Super Admin (Migo AI & Contenido)
interface TriageRule { name: string; keywords: string[]; responseTemplate: string; severity: string }
interface KnowledgeEntry { title: string; category: string; severity: string; description: string }

interface AiChatInput {
  messages: ChatTurn[];
  pet?: { name?: string | null; species?: string | null; breed?: string | null } | null;
  ownerName?: string | null;
}

const SPECIES_ES: Record<string, string> = {
  DOG: 'perro', CAT: 'gato', BIRD: 'ave', RABBIT: 'conejo', REPTILE: 'reptil', RODENT: 'roedor', OTHER: 'mascota',
};

// Acción sugerida que la app renderiza como botón bajo la respuesta de Migo IA
export interface ChatSuggestion {
  action: 'emergency' | 'grooming' | 'consult';
  label: string;
}

/**
 * Migo IA — asistente veterinario conversacional.
 * Usa Gemini si hay API key; si no, cae a respuestas heurísticas para no bloquear el chat.
 * Además, según el contexto, sugiere acciones (alerta de emergencia, peluquerías, agendar).
 */
export async function migoAiReply(
  input: AiChatInput,
): Promise<{ text: string; source: 'gemini' | 'fallback'; suggestions: ChatSuggestion[] }> {
  // Carga las reglas de triaje activas + la base de conocimiento del Super Admin.
  // Si la BD no responde, el chat sigue funcionando con la lógica base.
  let rules: TriageRule[] = [];
  let knowledge: KnowledgeEntry[] = [];
  try {
    const [r, k] = await Promise.all([
      prisma.aiTriageRule.findMany({ where: { active: true }, select: { name: true, keywords: true, responseTemplate: true, severity: true } }),
      prisma.aiKnowledgeEntry.findMany({ select: { title: true, category: true, severity: true, description: true }, take: 50 }),
    ]);
    rules = r;
    knowledge = k;
  } catch (err) {
    console.error('No se pudieron cargar reglas/conocimiento de Migo AI:', (err as Error).message);
  }

  let text: string;
  let source: 'gemini' | 'fallback';
  if (env.GEMINI_API_KEY) {
    try {
      text = await geminiChat(input, rules, knowledge);
      source = 'gemini';
    } catch (err) {
      console.error('Gemini chat falló, usando fallback:', (err as Error).message);
      text = fallbackReply(input);
      source = 'fallback';
    }
  } else {
    text = fallbackReply(input);
    source = 'fallback';
  }

  const lastUser = [...input.messages].reverse().find((m) => m.role === 'user')?.text ?? '';
  return { text, source, suggestions: computeSuggestions(lastUser, text, rules) };
}

// Deriva acciones sugeridas del último mensaje del dueño + la respuesta de la IA.
const EMERGENCY_KW = ['no respira', 'respirac', 'convuls', 'sangr', 'hemorrag', 'veneno', 'intoxic', 'atropell', 'inconsc', 'asfixia', 'ahog', 'colaps', 'emergencia', 'urgente', 'grave', 'crítico'];
const GROOMING_KW = ['peludo', 'pelo', 'corte', 'baño', 'bano', 'estétic', 'estetic', 'uña', 'cepill', 'grooming', 'enredad', 'despein', 'sucio', 'peluquer'];
const CONSULT_KW = ['vómit', 'vomit', 'diarrea', 'fiebre', 'decaíd', 'no come', 'dolor', 'cojea', 'rasca', 'alergia', 'piel', 'consulta', 'vacun', 'desparasit', 'revis'];

const EMERGENCY = { action: 'emergency', label: '🚨 Activar alerta de emergencia' } as const;
const GROOMING = { action: 'grooming', label: '✂️ Ver peluquerías cercanas' } as const;
const CONSULT = { action: 'consult', label: '📅 Agendar una consulta' } as const;

function computeSuggestions(userText: string, replyText: string, rules: TriageRule[] = []): ChatSuggestion[] {
  const u = userText.toLowerCase();
  const all = `${userText} ${replyText}`.toLowerCase();
  const out: ChatSuggestion[] = [];

  // 1) Reglas configuradas por el Super Admin (según lo que describe el dueño): severidad -> acción
  for (const r of rules) {
    if (r.keywords.some((k) => u.includes(k.toLowerCase()))) {
      out.push(r.severity === 'CRITICA' ? EMERGENCY : CONSULT);
    }
  }

  // 2) Lógica base (respaldo). Emergencia SOLO según lo que describe el dueño.
  if (EMERGENCY_KW.some((k) => u.includes(k))) out.push(EMERGENCY);
  if (GROOMING_KW.some((k) => all.includes(k))) out.push(GROOMING);
  if (CONSULT_KW.some((k) => all.includes(k))) out.push(CONSULT);

  // Dedupe por acción, conservando el orden (las reglas del admin tienen prioridad)
  const seen = new Set<string>();
  return out.filter((o) => (seen.has(o.action) ? false : seen.add(o.action))).slice(0, 2);
}

// ─── Gemini ───────────────────────────────────────────────
async function geminiChat(input: AiChatInput, rules: TriageRule[] = [], knowledge: KnowledgeEntry[] = []): Promise<string> {
  const p = input.pet;
  const petDesc = p?.name
    ? ` Ayudas con la mascota ${p.name}${p.species ? ` (${SPECIES_ES[p.species] ?? 'mascota'}${p.breed ? `, ${p.breed}` : ''})` : ''}.`
    : '';

  // Contenido curado desde el Super Admin (Migo AI & Contenido)
  const kbSection = knowledge.length
    ? `\n\nBASE DE CONOCIMIENTO CLÍNICA (curada por Migo, úsala como referencia prioritaria):\n${knowledge
        .map((k) => `- ${k.title} [${k.category} · ${k.severity}]: ${k.description}`)
        .join('\n')}`
    : '';
  const rulesSection = rules.length
    ? `\n\nREGLAS DE TRIAJE ACTIVAS (si el dueño menciona estas palabras, aplica la orientación indicada con ese nivel de urgencia):\n${rules
        .map((r) => `- Palabras [${r.keywords.join(', ')}] → nivel ${r.severity}. Orientación: ${r.responseTemplate}`)
        .join('\n')}`
    : '';

  const system = `Eres "Migo IA", la asistente veterinaria de la app Migo (Venezuela).${petDesc} Te diriges a ${input.ownerName || 'el dueño'} por su nombre cuando sea natural.
Responde SIEMPRE en español, cálida, empática y clara, en 2 a 4 frases. Ofrece orientación general y primeros auxilios prácticos, pero NUNCA des un diagnóstico definitivo ni recetes medicamentos específicos con dosis. Recomienda evaluación profesional cuando corresponda.
Si detectas señales de urgencia (dificultad para respirar, convulsiones, sangrado abundante, intoxicación, trauma grave, inconsciencia), dilo con claridad y sugiere activar la "Alerta de emergencia" en Migo o acudir de inmediato a una clínica. Usa emojis con moderación.${kbSection}${rulesSection}`;

  const contents = input.messages
    .slice(-12)
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents,
        // Presupuesto alto: los modelos flash nuevos gastan tokens en "pensamiento";
        // con poco margen la respuesta visible se corta (finishReason MAX_TOKENS).
        generationConfig: { temperature: 0.6, maxOutputTokens: 1200 },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
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
