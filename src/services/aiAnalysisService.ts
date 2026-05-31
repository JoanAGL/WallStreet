import { z } from "zod";
import { geminiChat } from "@/lib/geminiClient";
import type { TechnicalIndicators } from "./technicalAnalysisService";
import type { NewsAnalysis, Sentiment } from "./newsAnalysisService";
import type { FundamentalMetrics, MediumTermFundamentals, LongTermFundamentals, AllFundamentals } from "@/lib/yahooFinanceClient";
import type { InvestmentHorizon } from "@/types/models";
import type { PortfolioQuantMetrics } from "./quantitativeService";
import type { TradingAction } from "@/types/models";
import type { MacroGlobalContext } from "./macroService";
import type { EarningsGuidanceInsight } from "@/types/financial";

export interface StockScenario {
  label: "Positivo" | "Neutral" | "Negativo";
  horizon: "5-7 días";
  justification: string;
}

export interface AIStockAnalysis {
  ticker: string;
  analysisText: string;
  scenario: StockScenario;
  divergenceAlert: boolean;
  horizonMatch: string;
  keyMetrics: string[];
  generatedAt: string;
}

// ── System instructions por horizonte ────────────────────────────────────────

const SYSTEM_INSTRUCTIONS: Record<InvestmentHorizon, string> = {
  SHORT_TERM:
    "Eres un analista técnico especializado en trading de corto plazo (< 1 año). " +
    "Enfócate en momentum, volumen, volatilidad (ATR) y eventos de noticias recientes. " +
    "Tu análisis debe orientarse a identificar patrones técnicos y sentimiento de mercado inmediato. " +
    "Responde siempre en español y en formato JSON estricto. No hagas recomendaciones de compra/venta.",

  MEDIUM_TERM:
    "Eres un analista fundamental especializado en inversión de medio plazo (1-5 años). " +
    "Enfócate en salud operativa, crecimiento de ingresos, eficiencia del capital (ROE) y valoración relativa (PEG). " +
    "Tu análisis debe evaluar si la empresa tiene tracción financiera sostenible. " +
    "Responde siempre en español y en formato JSON estricto. No hagas recomendaciones de compra/venta.",

  LONG_TERM:
    "Eres un analista de valor especializado en inversión de largo plazo (> 5 años). " +
    "Enfócate en valor intrínseco, ventajas competitivas (moat), generación de caja libre (FCF), " +
    "historial de dividendos y solidez del balance. " +
    "Responde siempre en español y en formato JSON estricto. No hagas recomendaciones de compra/venta.",
};

// ── Formateo de métricas ──────────────────────────────────────────────────────

function fmtPct(v: number | null): string {
  return v != null ? `${(v * 100).toFixed(1)}%` : "N/D";
}
function fmtNum(v: number | null, dec = 2): string {
  return v != null ? v.toFixed(dec) : "N/D";
}

function formatTechnicalBlock(indicators: TechnicalIndicators): string {
  return [
    `RSI(14): ${fmtNum(indicators.rsi14)}`,
    `SMA20: ${fmtNum(indicators.sma20)}`,
    `SMA50: ${fmtNum(indicators.sma50)}`,
    `ATR(14): ${fmtNum(indicators.atr14)}`,
    `Volumen relativo: ${fmtNum(indicators.relVolume)}x`,
  ].join(" | ");
}

function formatMediumBlock(f: MediumTermFundamentals): string {
  return [
    `Revenue Growth YoY: ${fmtPct(f.revenueGrowthYoY)}`,
    `EPS Forward: ${fmtNum(f.forwardEps)}`,
    `PEG Ratio: ${fmtNum(f.pegRatio)}`,
    `Debt/Equity: ${fmtNum(f.debtToEquity)}`,
    `ROE: ${fmtPct(f.returnOnEquity)}`,
  ].join(" | ");
}

function formatLongBlock(f: LongTermFundamentals): string {
  return [
    `P/E Trailing: ${fmtNum(f.trailingPE)}`,
    `Dividend Yield: ${fmtPct(f.dividendYield)}`,
    `Margen Neto: ${fmtPct(f.profitMargin)}`,
    `FCF Yield: ${fmtPct(f.freeCashflowYield)}`,
    `Beta: ${fmtNum(f.beta)}`,
  ].join(" | ");
}

// ── Contexto temporal ─────────────────────────────────────────────────────────

function getTemporalContext(): string {
  const now = new Date();
  const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const dayName = days[now.getDay()];
  const dateStr = now.toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });
  return `${dayName}, ${dateStr}`;
}

// ── Construcción del prompt ───────────────────────────────────────────────────

function buildPrompt(
  ticker: string,
  price: number,
  changePercent: number,
  horizon: InvestmentHorizon,
  indicators: TechnicalIndicators,
  fundamentals: FundamentalMetrics | null,
  newsSummary: string,
  newsSentiment: Sentiment
): string {
  const horizonLabels: Record<InvestmentHorizon, string> = {
    SHORT_TERM:  "Corto Plazo (< 1 año)",
    MEDIUM_TERM: "Medio Plazo (1-5 años)",
    LONG_TERM:   "Largo Plazo (> 5 años)",
  };

  let metricsBlock: string;
  if (horizon === "SHORT_TERM") {
    metricsBlock = `Indicadores técnicos: ${formatTechnicalBlock(indicators)}`;
  } else if (horizon === "MEDIUM_TERM" && fundamentals?.horizon === "MEDIUM_TERM") {
    metricsBlock = `Métricas fundamentales: ${formatMediumBlock(fundamentals)}`;
  } else if (horizon === "LONG_TERM" && fundamentals?.horizon === "LONG_TERM") {
    metricsBlock = `Métricas de valor: ${formatLongBlock(fundamentals)}`;
  } else {
    metricsBlock = `Indicadores técnicos: ${formatTechnicalBlock(indicators)}`;
  }

  return `Analiza ${ticker} desde la perspectiva de ${horizonLabels[horizon]}.
Fecha de análisis: ${getTemporalContext()}.

Datos de mercado:
- Precio actual: $${price.toFixed(2)} (${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}% hoy)
- ${metricsBlock}
- Noticias recientes (48h): ${newsSummary}
- Sentimiento noticioso: ${newsSentiment}

Responde ÚNICAMENTE con este JSON (sin texto adicional):
{
  "analysisText": "Análisis objetivo de 3-4 oraciones enfocado en el horizonte ${horizonLabels[horizon]}. Sin recomendaciones.",
  "scenarioLabel": "Positivo|Neutral|Negativo",
  "scenarioJustification": "Una oración explicando el escenario para el horizonte indicado.",
  "divergenceAlert": true|false,
  "horizonMatch": "Breve explicación de por qué este activo encaja o no en el horizonte ${horizonLabels[horizon]}.",
  "keyMetrics": ["métrica relevante 1", "métrica relevante 2", "métrica relevante 3"]
}

Para divergenceAlert: true si indicadores técnicos y sentimiento noticioso apuntan en dirección opuesta.
Para keyMetrics: lista 3 métricas del contexto que más influyen en el análisis para este horizonte.

REGLAS: Sin recomendaciones de compra/venta. Sin proyecciones de precio. Solo análisis informativo.`;
}

// ── Función principal ─────────────────────────────────────────────────────────

export async function generateStockAnalysis(
  ticker: string,
  price: number,
  changePercent: number,
  indicators: TechnicalIndicators,
  newsAnalysis: NewsAnalysis,
  horizon: InvestmentHorizon = "SHORT_TERM",
  fundamentals: FundamentalMetrics | null = null
): Promise<AIStockAnalysis> {
  const prompt = buildPrompt(
    ticker,
    price,
    changePercent,
    horizon,
    indicators,
    fundamentals,
    newsAnalysis.summary,
    newsAnalysis.sentiment
  );

  const raw = await geminiChat(prompt, 700, 3, {
    systemInstruction: SYSTEM_INSTRUCTIONS[horizon],
    jsonMode: true,
  });

  let analysisText =
    "Análisis no disponible en este momento. Intenta actualizar más tarde.";
  let scenarioLabel: StockScenario["label"] = "Neutral";
  let scenarioJustification = "Datos insuficientes para determinar el escenario.";
  let divergenceAlert = false;
  let horizonMatch = "";
  let keyMetrics: string[] = [];

  try {
    const parsed = JSON.parse(raw) as {
      analysisText?: string;
      scenarioLabel?: string;
      scenarioJustification?: string;
      divergenceAlert?: unknown;
      horizonMatch?: string;
      keyMetrics?: unknown;
    };

    if (parsed.analysisText?.trim())          analysisText = parsed.analysisText;
    if (parsed.scenarioLabel === "Positivo" ||
        parsed.scenarioLabel === "Negativo" ||
        parsed.scenarioLabel === "Neutral")    scenarioLabel = parsed.scenarioLabel;
    if (parsed.scenarioJustification?.trim()) scenarioJustification = parsed.scenarioJustification;
    if (typeof parsed.divergenceAlert === "boolean") divergenceAlert = parsed.divergenceAlert;
    if (parsed.horizonMatch?.trim())          horizonMatch = parsed.horizonMatch;
    if (Array.isArray(parsed.keyMetrics))     keyMetrics = parsed.keyMetrics.filter((k): k is string => typeof k === "string");
  } catch {
    // Fallback a valores por defecto
  }

  return {
    ticker,
    analysisText,
    scenario: { label: scenarioLabel, horizon: "5-7 días", justification: scenarioJustification },
    divergenceAlert,
    horizonMatch,
    keyMetrics,
    generatedAt: new Date().toISOString(),
  };
}

// ── Multi-horizonte en una sola llamada ───────────────────────────────────────

export interface PrescriptiveAction {
  action: TradingAction;
  confidenceScore: number;       // 0–100
  executionPriceLimit: number;   // nivel técnico de referencia (no garantizado)
  quantitativeJustification: string;
  estimatedHorizonDays: number;
}

export interface HorizonAnalysis {
  analysisText: string;
  scenarioLabel: "Positivo" | "Neutral" | "Negativo";
  scenarioJustification: string;
  divergenceAlert: boolean;
  horizonMatch: string;
  keyMetrics: string[];
  portfolioAlert: string;
  prescriptiveAction: PrescriptiveAction;
}

export interface AllHorizonsAIAnalysis {
  shortTerm:  HorizonAnalysis;
  mediumTerm: HorizonAnalysis;
  longTerm:   HorizonAnalysis;
}

const FALLBACK_HORIZON: HorizonAnalysis = {
  analysisText:         "Análisis no disponible en este momento.",
  scenarioLabel:        "Neutral",
  scenarioJustification:"Datos insuficientes para determinar el escenario.",
  divergenceAlert:      false,
  horizonMatch:         "",
  keyMetrics:           [],
  portfolioAlert:       "",
  prescriptiveAction: {
    action:                  "MANTENER",
    confidenceScore:         0,
    executionPriceLimit:     0,
    quantitativeJustification: "Datos insuficientes para generar una proyección.",
    estimatedHorizonDays:    0,
  },
};

// Institutional system instruction — role, output contract, language policy.
// Constraints are framed as algorithmic-projection guidelines, not prohibitions on signals.
const SYSTEM_INSTRUCTION_ALL =
  "Eres un motor de análisis cuantitativo financiero automatizado al nivel de un Robo-Advisor institucional. " +
  "Tu función es generar proyecciones algorítmicas informativas basadas exclusivamente en datos matemáticos de mercado. " +
  "Reglas absolutas: " +
  "(1) Las señales de acción (COMPRA/VENTA/MANTENER/REDUCIR) son proyecciones algorítmicas informativas que NO constituyen asesoramiento financiero personalizado. " +
  "(2) El executionPriceLimit es un nivel técnico de referencia, no un precio garantizado. " +
  "(3) Tu lenguaje debe ser sobrio, técnico y en castellano. " +
  "(4) Responde únicamente con JSON válido, sin texto adicional ni markdown.";

function formatQuantBlock(q: PortfolioQuantMetrics): string {
  const corrStr = q.correlatedTickers.length > 0
    ? q.correlatedTickers
        .map((c) => `${c.ticker}=${c.correlationFactor.toFixed(2)}`)
        .join(", ")
    : "Sin otros activos en cartera";
  return [
    `Ratio de Sharpe: ${q.sharpeRatio.toFixed(2)}`,
    `Volatilidad anualizada (30d): ${q.volatility30d.toFixed(1)}%`,
    `Peso en cartera: ${q.portfolioWeight.toFixed(1)}%`,
    `Correlación con cartera: ${corrStr}`,
  ].join(" | ");
}

/**
 * Builds a dynamic system instruction that injects macro and earnings context
 * as background knowledge for the model, so it applies a consistent macro bias
 * across all three horizon analyses without repeating it in the user prompt.
 */
function buildDynamicSystemInstruction(
  macroContext?: MacroGlobalContext | null,
  earningsGuidance?: EarningsGuidanceInsight | null
): string {
  let instruction = SYSTEM_INSTRUCTION_ALL;

  if (macroContext && macroContext.items.length > 0) {
    const lines = macroContext.items.map((item) => {
      const sectors = item.affectedSectors.length > 0 ? ` [${item.affectedSectors.join(", ")}]` : "";
      return `  • [${item.impactLevel}]${sectors} ${item.title}`;
    });
    instruction += `\n\nCONTEXTO MACROECONÓMICO GLOBAL (últimas 24h):\n${lines.join("\n")}`;
    if (macroContext.items.some((i) => i.impactLevel === "HIGH")) {
      instruction +=
        "\nSESGO MACRO: Hay eventos de impacto HIGH activos. Reduce el confidenceScore en señales COMPRA " +
        "y justifica explícitamente el riesgo macro en quantitativeJustification.";
    }
  }

  if (earningsGuidance) {
    const rev = earningsGuidance.revenueGuidanceYoY != null
      ? `${earningsGuidance.revenueGuidanceYoY > 0 ? "+" : ""}${earningsGuidance.revenueGuidanceYoY}% YoY`
      : "no declarado";
    const quote = earningsGuidance.keyCeoQuotes[0] ?? "";
    instruction +=
      `\n\nGUIDANCE CORPORATIVO (${earningsGuidance.fiscalQuarter}):` +
      `\n  • Sentimiento directiva: ${earningsGuidance.sentiment}` +
      `\n  • Revenue guidance: ${rev} | EPS: ${earningsGuidance.epsGuidanceStatus}` +
      (quote ? `\n  • CEO/CFO: "${quote}"` : "") +
      `\n  • Contexto: ${earningsGuidance.macroImpactJustification}`;
    if (earningsGuidance.sentiment === "CONTRACTIVO") {
      instruction +=
        "\nSESGO EARNINGS: Guidance CONTRACTIVO confirmado. Sesga señales hacia MANTENER o REDUCIR " +
        "salvo soporte técnico de alta convicción (confidenceScore > 70).";
    } else if (earningsGuidance.sentiment === "EXPANSIVO") {
      instruction +=
        "\nSESGO EARNINGS: Guidance EXPANSIVO confirmado. Puedes elevar el confidenceScore en señales COMPRA " +
        "cuando los indicadores técnicos lo respalden.";
    }
  }

  return instruction;
}

function buildAllHorizonsPrompt(
  ticker: string,
  price: number,
  changePercent: number,
  indicators: TechnicalIndicators,
  allFundamentals: AllFundamentals,
  newsSummary: string,
  newsSentiment: Sentiment,
  riskProfile?: string | null,
  quantMetrics?: PortfolioQuantMetrics | null,
  fearGreedScore?: number | null
): string {
  const m = allFundamentals.medium;
  const l = allFundamentals.long;

  const riskCtx = riskProfile
    ? `\nPerfil de riesgo del inversor: ${riskProfile}.`
    : "";

  const quantCtx = quantMetrics
    ? `\nMétricas cuantitativas de portafolio (Robo-Advisor): ${formatQuantBlock(quantMetrics)}`
    : "";

  const fgCtx = fearGreedScore != null
    ? `\nÍndice Fear & Greed propietario: ${fearGreedScore}/100 (0=extremo miedo, 100=extrema codicia).`
    : "";

  const highCorrPairs = quantMetrics?.correlatedTickers.filter((c) => Math.abs(c.correlationFactor) > 0.75) ?? [];
  const diversAlert = highCorrPairs.length > 0
    ? `\nAlerta de diversificación: ${ticker} tiene correlación >0.75 con ${highCorrPairs.map((c) => c.ticker).join(", ")}.`
    : "";

  // Macro context and earnings guidance are injected in systemInstruction (see buildDynamicSystemInstruction)
  // to apply a consistent macro bias across all horizon blocks without inflating the user prompt.

  return `Efectúa un diagnóstico de riesgo multi-horizonte y genera señales algorítmicas para el activo [${ticker}].
Fecha: ${getTemporalContext()}.${riskCtx}${quantCtx}${fgCtx}${diversAlert}

Datos de mercado:
- Precio actual: $${price.toFixed(2)} (${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}% hoy)
- Noticias (48h): ${newsSummary} | Sentimiento: ${newsSentiment}

Indicadores técnicos (Corto Plazo): ${formatTechnicalBlock(indicators)}
Métricas fundamentales (Medio Plazo): ${formatMediumBlock(m)}
Métricas de valor (Largo Plazo): ${formatLongBlock(l)}

Genera el siguiente JSON con proyecciones algorítmicas por horizonte:
{
  "shortTerm": {
    "analysisText": "3-4 oraciones. Prioriza RSI, Fear&Greed, volatilidad y noticias.",
    "scenarioLabel": "Positivo|Neutral|Negativo",
    "scenarioJustification": "Una oración para el corto plazo.",
    "divergenceAlert": true|false,
    "horizonMatch": "Encaje del activo para trading de corto plazo.",
    "keyMetrics": ["métrica 1", "métrica 2", "métrica 3"],
    "portfolioAlert": "Riesgo de diversificación vs resto de cartera. Cadena vacía si no hay riesgo.",
    "prescriptiveAction": {
      "action": "COMPRA|VENTA|MANTENER|REDUCIR",
      "confidenceScore": 0-100,
      "executionPriceLimit": precio_técnico_de_referencia,
      "quantitativeJustification": "1-2 oraciones basadas en indicadores técnicos y Fear&Greed.",
      "estimatedHorizonDays": 5-30
    }
  },
  "mediumTerm": {
    "analysisText": "3-4 oraciones. Prioriza Sharpe, crecimiento operativo y correlaciones.",
    "scenarioLabel": "Positivo|Neutral|Negativo",
    "scenarioJustification": "Una oración para el medio plazo.",
    "divergenceAlert": true|false,
    "horizonMatch": "Encaje del activo para inversión de medio plazo.",
    "keyMetrics": ["métrica 1", "métrica 2", "métrica 3"],
    "portfolioAlert": "Riesgo de diversificación vs resto de cartera. Cadena vacía si no hay riesgo.",
    "prescriptiveAction": {
      "action": "COMPRA|VENTA|MANTENER|REDUCIR",
      "confidenceScore": 0-100,
      "executionPriceLimit": precio_técnico_de_referencia,
      "quantitativeJustification": "1-2 oraciones basadas en fundamentales y Sharpe.",
      "estimatedHorizonDays": 90-365
    }
  },
  "longTerm": {
    "analysisText": "3-4 oraciones. Prioriza FCF, moat, dividendos y Sharpe anualizado.",
    "scenarioLabel": "Positivo|Neutral|Negativo",
    "scenarioJustification": "Una oración para el largo plazo.",
    "divergenceAlert": true|false,
    "horizonMatch": "Encaje del activo para inversión de largo plazo.",
    "keyMetrics": ["métrica 1", "métrica 2", "métrica 3"],
    "portfolioAlert": "Riesgo de diversificación vs resto de cartera. Cadena vacía si no hay riesgo.",
    "prescriptiveAction": {
      "action": "COMPRA|VENTA|MANTENER|REDUCIR",
      "confidenceScore": 0-100,
      "executionPriceLimit": precio_técnico_de_referencia,
      "quantitativeJustification": "1-2 oraciones basadas en valor intrínseco y FCF.",
      "estimatedHorizonDays": 365-1825
    }
  }
}

divergenceAlert: true si técnicos y sentimiento apuntan en direcciones opuestas.
confidenceScore: 0-100 basado en la convergencia de señales cuantitativas. Nunca inventes datos.
executionPriceLimit: nivel técnico de soporte/resistencia relevante en USD (usa SMA, Fibonacci o niveles de precio).`;
}

// ── Zod schemas — strict validation of Gemini JSON output ────────────────────
// .catch() on each field means a bad value degrades gracefully to the fallback
// instead of propagating an error or silently accepting wrong data.

const ZPrescriptiveAction = z.object({
  action: z.enum(["COMPRA", "VENTA", "MANTENER", "REDUCIR"]).catch("MANTENER"),
  confidenceScore: z.number().catch(0).transform((v) => Math.min(100, Math.max(0, Math.round(v)))),
  executionPriceLimit: z.number().catch(0),
  quantitativeJustification: z.string().min(1).catch(
    FALLBACK_HORIZON.prescriptiveAction.quantitativeJustification
  ),
  estimatedHorizonDays: z.number().catch(0),
});

const ZHorizonAnalysis = z.object({
  analysisText:          z.string().min(1).catch(FALLBACK_HORIZON.analysisText),
  scenarioLabel:         z.enum(["Positivo", "Neutral", "Negativo"]).catch("Neutral"),
  scenarioJustification: z.string().min(1).catch(FALLBACK_HORIZON.scenarioJustification),
  divergenceAlert:       z.boolean().catch(false),
  horizonMatch:          z.string().catch(""),
  keyMetrics:            z.array(z.string()).catch([]),
  portfolioAlert:        z.string().catch(""),
  prescriptiveAction:    ZPrescriptiveAction.catch(FALLBACK_HORIZON.prescriptiveAction),
});

const ZAllHorizons = z.object({
  shortTerm:  ZHorizonAnalysis.catch(FALLBACK_HORIZON),
  mediumTerm: ZHorizonAnalysis.catch(FALLBACK_HORIZON),
  longTerm:   ZHorizonAnalysis.catch(FALLBACK_HORIZON),
});

export async function generateAllHorizonsAnalysis(
  ticker: string,
  price: number,
  changePercent: number,
  indicators: TechnicalIndicators,
  newsAnalysis: NewsAnalysis,
  allFundamentals: AllFundamentals,
  riskProfile?: string | null,
  quantMetrics?: PortfolioQuantMetrics | null,
  fearGreedScore?: number | null,
  macroContext?: MacroGlobalContext | null,
  earningsGuidance?: EarningsGuidanceInsight | null
): Promise<AllHorizonsAIAnalysis> {
  const prompt = buildAllHorizonsPrompt(
    ticker, price, changePercent, indicators,
    allFundamentals, newsAnalysis.summary, newsAnalysis.sentiment,
    riskProfile, quantMetrics, fearGreedScore
  );

  const systemInstruction = buildDynamicSystemInstruction(macroContext, earningsGuidance);

  const raw = await geminiChat(prompt, 2000, 3, {
    systemInstruction,
    jsonMode: true,
  });

  try {
    const result = ZAllHorizons.safeParse(JSON.parse(raw));
    if (!result.success) {
      console.warn(`[aiAnalysis] Zod validation failed for ${ticker}:`, result.error.flatten());
      return { shortTerm: FALLBACK_HORIZON, mediumTerm: FALLBACK_HORIZON, longTerm: FALLBACK_HORIZON };
    }
    return result.data as AllHorizonsAIAnalysis;
  } catch {
    return { shortTerm: FALLBACK_HORIZON, mediumTerm: FALLBACK_HORIZON, longTerm: FALLBACK_HORIZON };
  }
}
