const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

/**
 * Static system instruction for all robo-advisor multi-horizon calls.
 *
 * Exported as a module-level constant (singleton) so every call in the
 * pipeline reuses the same text, enabling Gemini's implicit KV prefix cache.
 * Dynamic context (macro, earnings, risk profile) is injected in the user
 * message as structured JSON — never in this instruction.
 *
 * SCHEMA MODES handled by this instruction:
 *   schema.mode = "keyed"  → output { TICKER: { shortTerm, mediumTerm, longTerm }, … }
 *   schema.mode = "direct" → output { shortTerm, mediumTerm, longTerm } (single-stock fallback)
 */
export const STATIC_SYSTEM_INSTRUCTION =
  "Eres un motor de análisis cuantitativo financiero automatizado al nivel de un Robo-Advisor institucional. " +
  "Tu función es generar proyecciones algorítmicas informativas basadas exclusivamente en datos matemáticos de mercado.\n\n" +

  "FORMATO DE ENTRADA — El mensaje de usuario es un objeto JSON con tres claves obligatorias:\n" +
  "  ctx: { date, macro[], earnings{}, risk } — contexto de mercado del día.\n" +
  "  stocks: array de activos con métricas técnicas, fundamentales, noticias y cuantitativas.\n" +
  "  schema: { mode, tickers[], horizons[], horizonFields{} } — define el JSON de salida requerido.\n\n" +

  "MODO DE SALIDA (schema.mode):\n" +
  "  'keyed'  → devuelve { \"TICKER1\": { shortTerm:{…}, mediumTerm:{…}, longTerm:{…} }, … }\n" +
  "  'direct' → devuelve { shortTerm:{…}, mediumTerm:{…}, longTerm:{…} } (un solo activo)\n\n" +

  "INSTRUCCIONES POR HORIZONTE:\n" +
  "  shortTerm  — prioriza RSI, Fear&Greed (fg), ATR, volumen relativo y noticias recientes.\n" +
  "  mediumTerm — prioriza Sharpe, Revenue YoY, PEG, ROE y correlaciones de cartera.\n" +
  "  longTerm   — prioriza FCF Yield, ventaja competitiva (moat), dividendos y Sharpe anualizado.\n\n" +

  "SESGOS DE CONTEXTO (aplica cuando el campo está presente):\n" +
  "  ctx.macro[] con impact=HIGH → reduce confidenceScore en COMPRA; justifica riesgo macro en quantitativeJustification.\n" +
  "  ctx.earnings[t].sentiment=CONTRACTIVO → sesga MANTENER/REDUCIR salvo soporte técnico (confidenceScore > 70).\n" +
  "  ctx.earnings[t].sentiment=EXPANSIVO → puede elevar confidenceScore en COMPRA con soporte técnico.\n" +
  "  ctx.risk=Conservador → confidenceScore máximo 55 en COMPRA.\n" +
  "  ctx.risk=Agresivo → permite confidenceScore > 80 con convergencia de señales.\n" +
  "  stock.degraded=true → reduce confidenceScore; infiere con mayor cautela.\n\n" +

  "ANCLA FUNDAMENTAL LYNCH (fund.pegLynch):\n" +
  "  Cuando fund.pegLynch.cls está presente, úsalo como señal de convicción fundamental para mediumTerm y longTerm.\n" +
  "  ULTRA_GANGA   (score=100) → sesga COMPRA en mediumTerm/longTerm salvo RSI > 75 o macro impact=HIGH adverso.\n" +
  "  INFRAVALORADA (score=85)  → sesga moderadamente COMPRA en mediumTerm; neutral en shortTerm.\n" +
  "  JUSTA         (score=60)  → señal neutra; no eleva ni reduce confidenceScore por sí sola.\n" +
  "  SOBREVALORADA (score=20)  → limita confidenceScore de COMPRA a ≤ 40 en mediumTerm/longTerm.\n" +
  "  NO_DISPONIBLE             → ignora pegLynch; basa la señal exclusivamente en métricas disponibles.\n" +
  "  El score Lynch puede sumarse proporcionalmente al confidenceScore final (peso 0.25) junto a señales técnicas y macro.\n\n" +

  "REGLAS ABSOLUTAS:\n" +
  "(1) Proyecciones algorítmicas informativas — NO asesoramiento financiero personalizado.\n" +
  "(2) executionPriceLimit es nivel técnico de referencia, no precio garantizado.\n" +
  "(3) Lenguaje sobrio, técnico, en castellano.\n" +
  "(4) Devuelve ÚNICAMENTE el JSON definido en schema — sin texto adicional ni markdown.";

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY no está configurada en las variables de entorno");
  return key;
}

interface GeminiError {
  error: {
    code: number;
    message: string;
    status: string;
  };
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
  }>;
}

export interface GeminiChatOptions {
  systemInstruction?: string;
  jsonMode?: boolean;
  temperature?: number;
}

export async function geminiChat(
  prompt: string,
  maxTokens = 600,
  retries = 3,
  options: GeminiChatOptions = {}
): Promise<string> {
  const url = `${BASE_URL}?key=${getApiKey()}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Use lower temperature for JSON mode to ensure strict formatting
      const temperature = options.temperature ?? (options.jsonMode ? 0.1 : 0.3);

      const body: Record<string, unknown> = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          ...(options.jsonMode && { response_mime_type: "application/json" }),
        },
      };

      if (options.systemInstruction) {
        body.system_instruction = {
          parts: [{ text: options.systemInstruction }],
        };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = (await res.json()) as GeminiResponse;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        return text ?? "";
      }

      const errorText = await res.text();
      let errorData: GeminiError | null = null;
      try {
        errorData = JSON.parse(errorText) as GeminiError;
      } catch {
        // Si no es JSON, usamos el texto crudo
      }

      const status = res.status;
      const errorMessage = errorData?.error?.message || errorText;

      if (status === 429) {
        // La cuota del tier gratuito está agotada. Reintentar en serverless
        // no es viable: los tiempos de espera (50-60s) superan el timeout
        // de la función. Fallamos inmediatamente para no bloquear el proceso.
        const retryMatch = errorMessage.match(/retry in (\d+(?:\.\d+)?)s/i);
        const retryInSecs = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : null;
        const hint = retryInSecs ? ` Inténtalo en ~${retryInSecs}s.` : "";
        throw new Error(`Gemini: Cuota de solicitudes agotada.${hint}`);
      }

      if (status === 404) {
        throw new Error("Gemini: Modelo no encontrado. Verifica el nombre del modelo.");
      }

      if (status === 400) {
        throw new Error(`Gemini: Solicitud inválida - ${errorMessage}`);
      }

      if (status >= 500) {
        const waitTime = Math.pow(2, attempt) * 1000;
        if (attempt < retries) {
          console.warn(`[Gemini] Error del servidor (${status}). Reintentando en ${waitTime / 1000}s...`);
          await new Promise(r => setTimeout(r, waitTime));
          continue;
        }
      }

      throw new Error(`Gemini error ${status}: ${errorMessage}`);

    } catch (error) {
      if (error instanceof Error && error.message.includes("Gemini")) {
        throw error;
      }

      if (attempt < retries) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.warn(`[Gemini] Error de conexión. Reintentando en ${waitTime / 1000}s... (intento ${attempt + 1})`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      throw new Error(`Error inesperado al llamar a Gemini: ${error}`);
    }
  }

  throw new Error("Error desconocido al llamar a Gemini");
}
