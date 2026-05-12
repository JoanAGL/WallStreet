import { geminiChat } from "@/lib/geminiClient";
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
  divergenceAlert: boolean;
  generatedAt: string;
}

const SYSTEM_INSTRUCTION = `Eres un analista informativo de mercados financieros. Tu tarea es explicar la situación actual de los activos de forma objetiva, sin hacer recomendaciones financieras de ningún tipo. Siempre respondes en español y en formato JSON estricto según el esquema solicitado.`;

function formatIndicators(indicators: TechnicalIndicators): string {
  const fmt = (v: number | null) => (v !== null ? v.toFixed(2) : "No disponible");
  return `SMA20: ${fmt(indicators.sma20)} | SMA50: ${fmt(indicators.sma50)} | RSI14: ${fmt(indicators.rsi14)}`;
}

function getTemporalContext(): string {
  const now = new Date();
  const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const dayName = days[now.getDay()];
  const dateStr = now.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `${dayName}, ${dateStr}`;
}

function buildAnalysisPrompt(
  ticker: string,
  price: number,
  changePercent: number,
  indicators: TechnicalIndicators,
  newsSummary: string,
  newsSentiment: Sentiment
): string {
  return `Analiza la situación actual de ${ticker} a fecha de hoy: ${getTemporalContext()}.

Datos disponibles:
- Precio actual: $${price.toFixed(2)} (${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}% hoy)
- Indicadores técnicos: ${formatIndicators(indicators)}
- Resumen de noticias (últimas 48h): ${newsSummary}
- Sentimiento noticioso: ${newsSentiment}

Responde ÚNICAMENTE con este JSON (sin texto adicional ni markdown):
{
  "analysisText": "Explicación objetiva de 3-4 oraciones sobre la situación técnica y el contexto noticioso. Sin recomendaciones de compra/venta.",
  "scenarioLabel": "Positivo|Neutral|Negativo",
  "scenarioJustification": "Una oración explicando por qué se clasifica así el escenario a corto plazo (5-7 días).",
  "divergenceAlert": true|false
}

Para divergenceAlert: ponlo en true si existe divergencia significativa entre indicadores técnicos y sentimiento noticioso (ej. RSI en sobreventa con noticias muy negativas, o precio en soporte con noticias muy positivas). Si hay divergencia, menciónala brevemente en analysisText.

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

  const raw = await geminiChat(prompt, 600, 3, {
    systemInstruction: SYSTEM_INSTRUCTION,
    jsonMode: true,
  });

  let analysisText =
    "Análisis no disponible en este momento. Intenta actualizar más tarde.";
  let scenarioLabel: StockScenario["label"] = "Neutral";
  let scenarioJustification = "Datos insuficientes para determinar el escenario.";
  let divergenceAlert = false;

  try {
    const parsed = JSON.parse(raw) as {
      analysisText?: string;
      scenarioLabel?: string;
      scenarioJustification?: string;
      divergenceAlert?: unknown;
    };

    if (parsed.analysisText?.trim()) {
      analysisText = parsed.analysisText;
    }
    if (
      parsed.scenarioLabel === "Positivo" ||
      parsed.scenarioLabel === "Negativo" ||
      parsed.scenarioLabel === "Neutral"
    ) {
      scenarioLabel = parsed.scenarioLabel;
    }
    if (parsed.scenarioJustification?.trim()) {
      scenarioJustification = parsed.scenarioJustification;
    }
    if (typeof parsed.divergenceAlert === "boolean") {
      divergenceAlert = parsed.divergenceAlert;
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
    divergenceAlert,
    generatedAt: new Date().toISOString(),
  };
}
