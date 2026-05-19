import { geminiChat } from "@/lib/geminiClient";
import type { TechnicalIndicators } from "./technicalAnalysisService";
import type { NewsAnalysis, Sentiment } from "./newsAnalysisService";
import type { FundamentalMetrics, MediumTermFundamentals, LongTermFundamentals, AllFundamentals } from "@/lib/yahooFinanceClient";
import type { InvestmentHorizon } from "@/types/models";
import type { PortfolioQuantMetrics } from "./quantitativeService";

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

export interface HorizonAnalysis {
  analysisText: string;
  scenarioLabel: "Positivo" | "Neutral" | "Negativo";
  scenarioJustification: string;
  divergenceAlert: boolean;
  horizonMatch: string;
  keyMetrics: string[];
  portfolioAlert: string;  // diversification risk vs the rest of the portfolio
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
};

// Institutional system instruction — role, constraints, and language policy.
// Kept separate from user prompt to avoid saturating the context window.
const SYSTEM_INSTRUCTION_ALL =
  "Eres un agente de análisis financiero institucional al nivel de un Robo-Advisor cuantitativo. " +
  "Tu enfoque es puramente analítico, descriptivo y basado en datos matemáticos. " +
  "Reglas absolutas: (1) Está terminantemente prohibido emitir recomendaciones de compra, venta o asesoramiento financiero directo. " +
  "(2) No hagas proyecciones de precio. " +
  "(3) Tu lenguaje debe ser sobrio, preciso y en castellano. " +
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

function buildAllHorizonsPrompt(
  ticker: string,
  price: number,
  changePercent: number,
  indicators: TechnicalIndicators,
  allFundamentals: AllFundamentals,
  newsSummary: string,
  newsSentiment: Sentiment,
  riskProfile?: string | null,
  quantMetrics?: PortfolioQuantMetrics | null
): string {
  const m = allFundamentals.medium;
  const l = allFundamentals.long;

  const riskCtx = riskProfile
    ? `\nPerfil de riesgo del inversor: ${riskProfile}.`
    : "";

  const quantCtx = quantMetrics
    ? `\nMétricas cuantitativas de portafolio (Robo-Advisor): ${formatQuantBlock(quantMetrics)}`
    : "";

  const highCorrPairs = quantMetrics?.correlatedTickers.filter((c) => Math.abs(c.correlationFactor) > 0.75) ?? [];
  const diversAlert = highCorrPairs.length > 0
    ? `\nAlerta de diversificación: ${ticker} tiene correlación >0.75 con ${highCorrPairs.map((c) => c.ticker).join(", ")}.`
    : "";

  return `Efectúa un diagnóstico de riesgo multi-horizonte para el activo [${ticker}].
Fecha: ${getTemporalContext()}.${riskCtx}${quantCtx}${diversAlert}

Datos de mercado:
- Precio: $${price.toFixed(2)} (${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}% hoy)
- Noticias (48h): ${newsSummary} | Sentimiento: ${newsSentiment}

Indicadores técnicos (Corto Plazo): ${formatTechnicalBlock(indicators)}
Métricas fundamentales (Medio Plazo): ${formatMediumBlock(m)}
Métricas de valor (Largo Plazo): ${formatLongBlock(l)}

Genera el siguiente JSON:
{
  "shortTerm": {
    "analysisText": "3-4 oraciones. Prioriza RSI, volatilidad y sentimiento de noticias.",
    "scenarioLabel": "Positivo|Neutral|Negativo",
    "scenarioJustification": "Una oración para el corto plazo.",
    "divergenceAlert": true|false,
    "horizonMatch": "Por qué encaja o no para trading de corto plazo.",
    "keyMetrics": ["métrica 1", "métrica 2", "métrica 3"],
    "portfolioAlert": "Riesgo de diversificación para este activo en el portafolio actual."
  },
  "mediumTerm": {
    "analysisText": "3-4 oraciones. Prioriza Sharpe, crecimiento operativo y correlaciones.",
    "scenarioLabel": "Positivo|Neutral|Negativo",
    "scenarioJustification": "Una oración para el medio plazo.",
    "divergenceAlert": true|false,
    "horizonMatch": "Por qué encaja o no para inversión de medio plazo.",
    "keyMetrics": ["métrica 1", "métrica 2", "métrica 3"],
    "portfolioAlert": "Riesgo de diversificación para este activo en el portafolio actual."
  },
  "longTerm": {
    "analysisText": "3-4 oraciones. Prioriza Sharpe, FCF, moat y correlaciones de largo plazo.",
    "scenarioLabel": "Positivo|Neutral|Negativo",
    "scenarioJustification": "Una oración para el largo plazo.",
    "divergenceAlert": true|false,
    "horizonMatch": "Por qué encaja o no para inversión de largo plazo.",
    "keyMetrics": ["métrica 1", "métrica 2", "métrica 3"],
    "portfolioAlert": "Riesgo de diversificación para este activo en el portafolio actual."
  }
}

divergenceAlert: true si técnicos y sentimiento noticioso apuntan en direcciones opuestas.
portfolioAlert: menciona si la correlación con otros activos pone en riesgo la diversificación (con qué tickers y por qué). Si no hay riesgo, devuelve cadena vacía.`;
}

function parseHorizonBlock(raw: Record<string, unknown> | undefined): HorizonAnalysis {
  if (!raw) return FALLBACK_HORIZON;
  const label = raw.scenarioLabel;
  return {
    analysisText:          typeof raw.analysisText === "string" && raw.analysisText.trim()
                             ? raw.analysisText : FALLBACK_HORIZON.analysisText,
    scenarioLabel:         label === "Positivo" || label === "Negativo" || label === "Neutral"
                             ? label : "Neutral",
    scenarioJustification: typeof raw.scenarioJustification === "string" && raw.scenarioJustification.trim()
                             ? raw.scenarioJustification : FALLBACK_HORIZON.scenarioJustification,
    divergenceAlert:       typeof raw.divergenceAlert === "boolean" ? raw.divergenceAlert : false,
    horizonMatch:          typeof raw.horizonMatch === "string" ? raw.horizonMatch : "",
    keyMetrics:            Array.isArray(raw.keyMetrics)
                             ? raw.keyMetrics.filter((k): k is string => typeof k === "string")
                             : [],
    portfolioAlert:        typeof raw.portfolioAlert === "string" ? raw.portfolioAlert : "",
  };
}

export async function generateAllHorizonsAnalysis(
  ticker: string,
  price: number,
  changePercent: number,
  indicators: TechnicalIndicators,
  newsAnalysis: NewsAnalysis,
  allFundamentals: AllFundamentals,
  riskProfile?: string | null,
  quantMetrics?: PortfolioQuantMetrics | null
): Promise<AllHorizonsAIAnalysis> {
  const prompt = buildAllHorizonsPrompt(
    ticker, price, changePercent, indicators,
    allFundamentals, newsAnalysis.summary, newsAnalysis.sentiment,
    riskProfile, quantMetrics
  );

  const raw = await geminiChat(prompt, 2000, 3, {
    systemInstruction: SYSTEM_INSTRUCTION_ALL,
    jsonMode: true,
  });

  try {
    const parsed = JSON.parse(raw) as {
      shortTerm?:  Record<string, unknown>;
      mediumTerm?: Record<string, unknown>;
      longTerm?:   Record<string, unknown>;
    };
    return {
      shortTerm:  parseHorizonBlock(parsed.shortTerm),
      mediumTerm: parseHorizonBlock(parsed.mediumTerm),
      longTerm:   parseHorizonBlock(parsed.longTerm),
    };
  } catch {
    return { shortTerm: FALLBACK_HORIZON, mediumTerm: FALLBACK_HORIZON, longTerm: FALLBACK_HORIZON };
  }
}
