import { geminiChat } from "@/lib/geminiClient";
import type { EarningsGuidanceInsight, GuidanceSentiment, EpsGuidanceStatus } from "@/types/financial";

// ── Constants ─────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — one per fiscal quarter

const VALID_SENTIMENTS: GuidanceSentiment[] = ["EXPANSIVO", "PRUDENTE", "CONTRACTIVO"];
const VALID_EPS_STATUSES: EpsGuidanceStatus[] = ["UPWARD", "DOWNWARD", "STABLE"];

const SYSTEM_INSTRUCTION =
  "Eres un analista financiero institucional especializado en Earnings Calls y guidance corporativo. " +
  "Tu función es inferir las proyecciones de guidance más recientes para empresas cotizadas, " +
  "basándote exclusivamente en información pública disponible en tu entrenamiento (últimos earnings reportados). " +
  "Reglas absolutas: " +
  "(1) Los datos son proyecciones inferenciales, no asesoramiento financiero personalizado. " +
  "(2) Si no dispones de datos suficientes para un campo, usa valores conservadores (PRUDENTE / STABLE / null). " +
  "(3) Responde únicamente con JSON válido, sin texto adicional ni markdown.";

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
  data: EarningsGuidanceInsight;
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCurrentFiscalQuarter(): string {
  const now = new Date();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${quarter} ${now.getFullYear()}`;
}

function buildFallback(quarter: string): EarningsGuidanceInsight {
  return {
    fiscalQuarter: quarter,
    sentiment: "PRUDENTE",
    revenueGuidanceYoY: null,
    epsGuidanceStatus: "STABLE",
    keyCeoQuotes: [
      "We remain cautiously optimistic about the macro environment.",
      "Our focus continues to be on operational efficiency and margin expansion.",
    ],
    macroImpactJustification:
      "Datos de earnings no disponibles en el entorno actual. Proyección de referencia con sentimiento neutro.",
  };
}

function buildPrompt(ticker: string, quarter: string): string {
  return `Analiza el guidance corporativo más reciente de ${ticker} correspondiente al trimestre ${quarter}.

Basándote en los últimos earnings calls y reportes financieros públicos, genera el siguiente JSON:
{
  "fiscalQuarter": "${quarter}",
  "sentiment": "EXPANSIVO|PRUDENTE|CONTRACTIVO",
  "revenueGuidanceYoY": porcentaje_numérico_o_null,
  "epsGuidanceStatus": "UPWARD|DOWNWARD|STABLE",
  "keyCeoQuotes": ["cita_representativa_1", "cita_representativa_2"],
  "macroImpactJustification": "1-2 oraciones sobre el impacto del entorno macro en el guidance emitido."
}

Criterios de clasificación:
- EXPANSIVO: guidance de ingresos >5% YoY y EPS UPWARD o por encima del consenso.
- CONTRACTIVO: guidance de ingresos negativo o reducción significativa de EPS.
- PRUDENTE: guidance moderado, conservador o en línea con el consenso sin sorpresa.
- revenueGuidanceYoY: porcentaje numérico (ej. 8.5 para +8.5% YoY), null si no declarado.
- keyCeoQuotes: máximo 3 frases textuales o parafraseadas del CEO/CFO que reflejen el tono del guidance.
- Si los datos disponibles son insuficientes: sentiment="PRUDENTE", revenueGuidanceYoY=null, epsGuidanceStatus="STABLE".`;
}

function parseGuidance(raw: string, quarter: string): EarningsGuidanceInsight {
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  const sentiment: GuidanceSentiment = VALID_SENTIMENTS.includes(parsed.sentiment as GuidanceSentiment)
    ? (parsed.sentiment as GuidanceSentiment)
    : "PRUDENTE";

  const epsGuidanceStatus: EpsGuidanceStatus = VALID_EPS_STATUSES.includes(parsed.epsGuidanceStatus as EpsGuidanceStatus)
    ? (parsed.epsGuidanceStatus as EpsGuidanceStatus)
    : "STABLE";

  const revenueGuidanceYoY =
    typeof parsed.revenueGuidanceYoY === "number" && isFinite(parsed.revenueGuidanceYoY)
      ? parseFloat(parsed.revenueGuidanceYoY.toFixed(2))
      : null;

  const keyCeoQuotes = Array.isArray(parsed.keyCeoQuotes)
    ? parsed.keyCeoQuotes
        .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
        .slice(0, 3)
    : [];

  const macroImpactJustification =
    typeof parsed.macroImpactJustification === "string" && parsed.macroImpactJustification.trim()
      ? parsed.macroImpactJustification.trim()
      : buildFallback(quarter).macroImpactJustification;

  const fiscalQuarter =
    typeof parsed.fiscalQuarter === "string" && parsed.fiscalQuarter.trim()
      ? parsed.fiscalQuarter.trim()
      : quarter;

  return { fiscalQuarter, sentiment, revenueGuidanceYoY, epsGuidanceStatus, keyCeoQuotes, macroImpactJustification };
}

// ── EarningsService ───────────────────────────────────────────────────────────

export class EarningsService {
  /**
   * Returns the earnings guidance insight for a given ticker.
   * Results are cached 30 days per fiscal quarter — Gemini is only called once per ticker/quarter.
   * Falls back to structured mock data when GEMINI_API_KEY is not configured (dev environments).
   */
  static async getGuidanceInsight(ticker: string): Promise<EarningsGuidanceInsight> {
    const normalized = ticker.toUpperCase().trim();
    const quarter = getCurrentFiscalQuarter();

    if (!process.env.GEMINI_API_KEY) {
      return buildFallback(quarter);
    }

    const cacheKey = `${normalized}::${quarter}`;
    const now = Date.now();
    const cached = _cache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
      return cached.data;
    }

    const prompt = buildPrompt(normalized, quarter);

    try {
      const raw = await geminiChat(prompt, 600, 2, {
        systemInstruction: SYSTEM_INSTRUCTION,
        jsonMode: true,
        temperature: 0.1,
      });

      const data = parseGuidance(raw, quarter);
      _cache.set(cacheKey, { data, expiresAt: now + CACHE_TTL_MS });
      return data;
    } catch (err) {
      console.error(`[EarningsService] Gemini inference failed for ${normalized}:`, err);
      return buildFallback(quarter);
    }
  }
}
