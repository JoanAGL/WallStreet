import { chatCompletion } from "@/lib/openaiClient";
import type { TechnicalIndicators } from "./technicalAnalysisService";
import type { NewsAnalysis, Sentiment } from "./newsAnalysisService";

export interface StockScenario {
  label: "Positivo" | "Neutral" | "Negativo";
  horizon: "5-7 días";
  justification: string;
}

export interface AIStockAnalysis {
  ticker: string;
  analysisText: string;
  scenario: StockScenario;
  generatedAt: string;
}

function formatIndicators(indicators: TechnicalIndicators): string {
  const fmt = (v: number | null) => (v !== null ? v.toFixed(2) : "No disponible");
  return `SMA20: ${fmt(indicators.sma20)} | SMA50: ${fmt(indicators.sma50)} | RSI14: ${fmt(indicators.rsi14)}`;
}

function buildAnalysisPrompt(
  ticker: string,
  price: number,
  changePercent: number,
  indicators: TechnicalIndicators,
  newsSummary: string,
  newsSentiment: Sentiment
): string {
  return `Eres un analista informativo de mercados. Tu tarea es explicar la situación actual de ${ticker} de forma objetiva, sin hacer recomendaciones financieras de ningún tipo.

Datos disponibles:
- Precio actual: $${price.toFixed(2)} (${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}% hoy)
- Indicadores técnicos: ${formatIndicators(indicators)}
- Resumen de noticias (últimas 48h): ${newsSummary}
- Sentimiento noticioso: ${newsSentiment}

Responde ÚNICAMENTE con el siguiente JSON (sin markdown):
{
  "analysisText": "Explicación objetiva de 3-4 oraciones sobre la situación técnica y el contexto noticioso. Sin recomendaciones de compra/venta.",
  "scenarioLabel": "Positivo|Neutral|Negativo",
  "scenarioJustification": "Una oración explicando por qué se clasifica así el escenario a corto plazo (5-7 días)."
}

REGLAS CRÍTICAS:
- Prohibido recomendar comprar, vender o mantener.
- Prohibido proyectar precios futuros.
- El análisis es puramente informativo y educativo.
- Usa lenguaje claro en español.`;
}

export async function generateStockAnalysis(
  ticker: string,
  price: number,
  changePercent: number,
  indicators: TechnicalIndicators,
  newsAnalysis: NewsAnalysis
): Promise<AIStockAnalysis> {
  const prompt = buildAnalysisPrompt(
    ticker,
    price,
    changePercent,
    indicators,
    newsAnalysis.summary,
    newsAnalysis.sentiment
  );

  const raw = await chatCompletion(
    [{ role: "user", content: prompt }],
    "gpt-4o-mini",
    600
  );

  let analysisText =
    "Análisis no disponible en este momento. Intenta actualizar más tarde.";
  let scenarioLabel: StockScenario["label"] = "Neutral";
  let scenarioJustification = "Datos insuficientes para determinar el escenario.";

  try {
    const parsed = JSON.parse(raw) as {
      analysisText?: string;
      scenarioLabel?: string;
      scenarioJustification?: string;
    };

    if (parsed.analysisText) analysisText = parsed.analysisText;
    if (
      parsed.scenarioLabel === "Positivo" ||
      parsed.scenarioLabel === "Negativo" ||
      parsed.scenarioLabel === "Neutral"
    ) {
      scenarioLabel = parsed.scenarioLabel;
    }
    if (parsed.scenarioJustification) {
      scenarioJustification = parsed.scenarioJustification;
    }
  } catch {
    // Fallback a valores por defecto si el LLM no devuelve JSON válido
  }

  return {
    ticker,
    analysisText,
    scenario: {
      label: scenarioLabel,
      horizon: "5-7 días",
      justification: scenarioJustification,
    },
    generatedAt: new Date().toISOString(),
  };
}
