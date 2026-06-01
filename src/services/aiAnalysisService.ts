import { z } from "zod";
import { geminiChat, STATIC_SYSTEM_INSTRUCTION } from "@/lib/geminiClient";
import type { TechnicalIndicators } from "./technicalAnalysisService";
import type { NewsAnalysis, Sentiment } from "./newsAnalysisService";
import type { FundamentalMetrics, MediumTermFundamentals, LongTermFundamentals, AllFundamentals } from "@/lib/yahooFinanceClient";
import type { InvestmentHorizon } from "@/types/models";
import { classifyPegValue } from "./quantitativeService";
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

export const FALLBACK_HORIZON: HorizonAnalysis = {
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

// ── Static horizon-output schema (goes in user message, NOT systemInstruction) ─
// Defined once so JSON.stringify produces identical bytes every call.
const HORIZON_FIELDS_SCHEMA = {
  analysisText:          "string: 3-4 oraciones",
  scenarioLabel:         "Positivo|Neutral|Negativo",
  scenarioJustification: "string: 1 oración",
  divergenceAlert:       "boolean",
  horizonMatch:          "string",
  keyMetrics:            ["string", "string", "string"],
  portfolioAlert:        "string: riesgo de diversificación o cadena vacía",
  prescriptiveAction: {
    action:                    "COMPRA|VENTA|MANTENER|REDUCIR",
    confidenceScore:           "integer: 0-100",
    executionPriceLimit:       "number: nivel técnico USD",
    quantitativeJustification: "string: 1-2 oraciones",
    estimatedHorizonDays:      "integer",
  },
} as const;

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
  const { medium: m, long: l } = allFundamentals;

  // Dynamic context moves to the user message — systemInstruction stays static.
  const ctx = {
    date:     getTemporalContext(),
    macro:    (macroContext?.items ?? []).map((i) => ({ title: i.title, impact: i.impactLevel, sectors: i.affectedSectors })),
    earnings: earningsGuidance
      ? { [ticker]: { q: earningsGuidance.fiscalQuarter, sentiment: earningsGuidance.sentiment, revenueYoY: earningsGuidance.revenueGuidanceYoY, eps: earningsGuidance.epsGuidanceStatus } }
      : {},
    risk: riskProfile ?? null,
  };

  const stock = {
    ticker, price, chg: changePercent,
    tech:  { rsi14: indicators.rsi14, sma20: indicators.sma20, sma50: indicators.sma50, atr14: indicators.atr14, relVol: indicators.relVolume },
    fund:  { peg: m.pegRatio, pegLynch: (() => { const p = classifyPegValue(m.pegRatio); return { cls: p.valuationStatus, score: p.pegScore }; })(), fwdEps: m.forwardEps, revGrowth: m.revenueGrowthYoY, roe: m.returnOnEquity, de: m.debtToEquity, pe: l.trailingPE, divYield: l.dividendYield, margin: l.profitMargin, fcfYield: l.freeCashflowYield, beta: l.beta },
    news:  { summary: newsAnalysis.summary, sentiment: newsAnalysis.sentiment },
    fg:    fearGreedScore ?? null,
    quant: quantMetrics ? { sharpe: quantMetrics.sharpeRatio, kelly: quantMetrics.kellyFraction, weight: quantMetrics.portfolioWeight, corr: quantMetrics.correlatedTickers } : null,
    degraded: false,
  };

  const schema = {
    mode:         "direct" as const,
    tickers:      [ticker],
    horizons:     ["shortTerm", "mediumTerm", "longTerm"],
    horizonFields: HORIZON_FIELDS_SCHEMA,
  };

  const prompt = JSON.stringify({ ctx, stocks: [stock], schema });

  const raw = await geminiChat(prompt, 2000, 3, {
    systemInstruction: STATIC_SYSTEM_INSTRUCTION,
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

// ── Batch All-Horizons Analysis ───────────────────────────────────────────────

export interface DataQuality {
  technical:    boolean; // historical closes + indicators available
  fundamentals: boolean; // Yahoo fundamentals available
  news:         boolean; // NewsAPI articles available
  degraded:     boolean; // any required source failed (quote or historical)
}

export interface BatchStockInput {
  ticker: string;
  price: number;
  changePercent: number;
  indicators: TechnicalIndicators;
  newsAnalysis: NewsAnalysis;
  allFundamentals: AllFundamentals;
  riskProfile?: string | null;
  quantMetrics?: PortfolioQuantMetrics | null;
  fearGreedScore?: number | null;
  earningsGuidance?: EarningsGuidanceInsight | null;
  dataQuality?: DataQuality;
}

// Max tickers per Gemini call. 4 keeps the prompt + response under ~8k tokens.
const BATCH_SIZE = 4;

const FALLBACK_ALL: AllHorizonsAIAnalysis = {
  shortTerm: FALLBACK_HORIZON,
  mediumTerm: FALLBACK_HORIZON,
  longTerm: FALLBACK_HORIZON,
};

/**
 * Builds the JSON-structured user message for a batch of stocks.
 *
 * Dynamic context (macro, earnings, riskProfile) is serialized as compact JSON
 * in ctx so systemInstruction can remain static across all calls, enabling
 * Gemini's implicit KV prefix cache on the system prompt.
 *
 * Output schema is included in the user message (not systemInstruction) so
 * Gemini validates its output against the spec on each call.
 */
function buildBatchPrompt(
  inputs: BatchStockInput[],
  macroContext?: MacroGlobalContext | null
): string {
  const riskProfile = inputs[0]?.riskProfile ?? null;

  const ctx = {
    date: getTemporalContext(),
    macro: (macroContext?.items ?? []).map((item) => ({
      title:   item.title,
      impact:  item.impactLevel,
      sectors: item.affectedSectors,
    })),
    earnings: Object.fromEntries(
      inputs
        .filter((inp) => inp.earningsGuidance)
        .map((inp) => {
          const eg = inp.earningsGuidance!;
          return [inp.ticker, {
            q:          eg.fiscalQuarter,
            sentiment:  eg.sentiment,
            revenueYoY: eg.revenueGuidanceYoY,
            eps:        eg.epsGuidanceStatus,
          }];
        })
    ),
    risk: riskProfile,
  };

  const stocks = inputs.map((inp) => {
    const { medium: m, long: l } = inp.allFundamentals;
    const qm = inp.quantMetrics;
    return {
      ticker:   inp.ticker,
      price:    inp.price,
      chg:      inp.changePercent,
      tech: {
        rsi14:  inp.indicators.rsi14,
        sma20:  inp.indicators.sma20,
        sma50:  inp.indicators.sma50,
        atr14:  inp.indicators.atr14,
        relVol: inp.indicators.relVolume,
      },
      fund: {
        peg:       m.pegRatio,
        pegLynch:  (({ valuationStatus: cls, pegScore: score }) => ({ cls, score }))(classifyPegValue(m.pegRatio)),
        fwdEps:    m.forwardEps,
        revGrowth: m.revenueGrowthYoY,
        roe:       m.returnOnEquity,
        de:        m.debtToEquity,
        pe:        l.trailingPE,
        divYield:  l.dividendYield,
        margin:    l.profitMargin,
        fcfYield:  l.freeCashflowYield,
        beta:      l.beta,
      },
      news:     { summary: inp.newsAnalysis.summary, sentiment: inp.newsAnalysis.sentiment },
      fg:       inp.fearGreedScore ?? null,
      quant:    qm ? { sharpe: qm.sharpeRatio, kelly: qm.kellyFraction, weight: qm.portfolioWeight, corr: qm.correlatedTickers } : null,
      degraded: inp.dataQuality?.degraded ?? false,
    };
  });

  // Schema is in the user message (not systemInstruction) so it stays cacheable
  // alongside the static system prompt and is validated on every call.
  const schema = {
    mode:         "keyed" as const,
    tickers:      inputs.map((i) => i.ticker),
    horizons:     ["shortTerm", "mediumTerm", "longTerm"],
    horizonFields: HORIZON_FIELDS_SCHEMA,
  };

  return JSON.stringify({ ctx, stocks, schema });
}

/**
 * Generates AllHorizonsAIAnalysis for multiple tickers in BATCH_SIZE groups.
 * Reduces N individual Gemini calls to ceil(N/BATCH_SIZE) calls.
 *
 * Per-group error handling: if a batch call fails, falls back to individual
 * calls for each ticker in that group rather than returning all fallbacks.
 */
export async function batchGenerateAllHorizons(
  inputs: BatchStockInput[],
  macroContext?: MacroGlobalContext | null
): Promise<Map<string, AllHorizonsAIAnalysis>> {
  const resultMap = new Map<string, AllHorizonsAIAnalysis>();

  // STATIC_SYSTEM_INSTRUCTION never changes → Gemini can implicitly cache it.
  // Dynamic context (macro, earnings, risk) is in the user message via buildBatchPrompt.
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const group = inputs.slice(i, i + BATCH_SIZE);
    const tickers = group.map((g) => g.ticker);

    try {
      const prompt = buildBatchPrompt(group, macroContext);
      const raw = await geminiChat(prompt, 2000 * group.length, 2, {
        systemInstruction: STATIC_SYSTEM_INSTRUCTION,
        jsonMode: true,
      });

      const parsed = JSON.parse(raw) as Record<string, unknown>;
      tickers.forEach((ticker) => {
        const entry = ZAllHorizons.safeParse(parsed[ticker]);
        if (entry.success) {
          resultMap.set(ticker, entry.data as AllHorizonsAIAnalysis);
        } else {
          console.warn(`[aiAnalysis] Batch Zod failed for ${ticker}:`, entry.error.flatten());
          resultMap.set(ticker, FALLBACK_ALL);
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[aiAnalysis] Batch call failed (${message}), falling back to individual calls for ${tickers.join(", ")}`);

      // Individual fallback for the failed group
      await Promise.allSettled(
        group.map(async (input) => {
          try {
            const analysis = await generateAllHorizonsAnalysis(
              input.ticker, input.price, input.changePercent,
              input.indicators, input.newsAnalysis, input.allFundamentals,
              input.riskProfile, input.quantMetrics, input.fearGreedScore,
              macroContext, input.earningsGuidance
            );
            resultMap.set(input.ticker, analysis);
          } catch {
            resultMap.set(input.ticker, FALLBACK_ALL);
          }
        })
      );
    }
  }

  return resultMap;
}
