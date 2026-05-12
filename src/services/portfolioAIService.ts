import { geminiChat } from "@/lib/geminiClient";
import type { InvestmentHorizon } from "@/types/models";
import { HORIZON_LABELS } from "@/types/models";

export interface PortfolioStockInput {
  ticker: string;
  price: number;
  changePercent: number;
  investmentHorizon: InvestmentHorizon;
  scenarioLabel: "Positivo" | "Neutral" | "Negativo";
  scenarioJustification: string;
  divergenceAlert: boolean;
  newsSentiment: string;
  keyMetrics: string[];
  // Optional position data
  purchasePrice?: number | null;
  quantity?: number | null;
  costBasis?: number | null;
  currentValue?: number | null;
  pnl?: number | null;
  pnlPct?: number | null;
}

export interface PortfolioAIAnalysis {
  overallSentiment: "Optimista" | "Neutro" | "Conservador";
  riskProfile: "Bajo" | "Moderado" | "Alto";
  diversificationScore: number;
  diversificationComment: string;
  sectorConcentration: string;
  keyOpportunities: string[];
  keyRisks: string[];
  portfolioSummaryText: string;
  rebalancingHint: string | null;
}

const FALLBACK: PortfolioAIAnalysis = {
  overallSentiment:     "Neutro",
  riskProfile:          "Moderado",
  diversificationScore: 5,
  diversificationComment: "Análisis no disponible en este momento.",
  sectorConcentration:  "",
  keyOpportunities:     [],
  keyRisks:             [],
  portfolioSummaryText: "El análisis global de cartera no está disponible temporalmente.",
  rebalancingHint:      null,
};

const SYSTEM_INSTRUCTION =
  "Eres un gestor de carteras con experiencia en análisis cuantitativo y cualitativo. " +
  "Tu función es evaluar portfolios de inversión de forma holística, identificando fortalezas, " +
  "riesgos y oportunidades a nivel de cartera, no de acciones individuales. " +
  "Responde siempre en español y en formato JSON estricto. Sin recomendaciones de compra/venta.";

export async function generatePortfolioAnalysis(
  stocks: PortfolioStockInput[]
): Promise<PortfolioAIAnalysis> {
  if (stocks.length < 2) return FALLBACK;

  const fmtMoney = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

  const stocksBlock = stocks
    .map((s) => {
      const positionLine =
        s.costBasis != null && s.currentValue != null && s.pnl != null && s.pnlPct != null
          ? `  Posición: ${s.quantity} acciones | Comprado a ${fmtMoney(s.purchasePrice!)} | Invertido: ${fmtMoney(s.costBasis)} | Valor actual: ${fmtMoney(s.currentValue)} | P&L: ${s.pnl >= 0 ? "+" : ""}${fmtMoney(s.pnl)} (${s.pnlPct >= 0 ? "+" : ""}${s.pnlPct.toFixed(2)}%)`
          : null;

      return (
        `• ${s.ticker} | $${s.price.toFixed(2)} (${s.changePercent >= 0 ? "+" : ""}${s.changePercent.toFixed(2)}% hoy) | Horizonte: ${HORIZON_LABELS[s.investmentHorizon]}\n` +
        `  Escenario: ${s.scenarioLabel} — ${s.scenarioJustification}\n` +
        `  Sentimiento noticias: ${s.newsSentiment} | Divergencia técnico-fundamental: ${s.divergenceAlert ? "Sí ⚠" : "No"}\n` +
        `  Métricas clave: ${s.keyMetrics.join(", ") || "N/D"}` +
        (positionLine ? `\n${positionLine}` : "")
      );
    })
    .join("\n\n");

  const hasPositionData = stocks.some((s) => s.costBasis != null);

  const prompt = `Analiza el siguiente portfolio de ${stocks.length} acciones como un conjunto. No analices cada acción de forma individual — evalúa la cartera de forma global.${hasPositionData ? " Cuando estén disponibles, usa los datos de posición (coste, P&L) para contextualizar el análisis." : ""}

PORTFOLIO:
${stocksBlock}

Responde ÚNICAMENTE con este JSON (sin texto adicional):
{
  "overallSentiment": "Optimista|Neutro|Conservador",
  "riskProfile": "Bajo|Moderado|Alto",
  "diversificationScore": 0-10,
  "diversificationComment": "Una oración sobre el nivel de diversificación (sectores, horizontes de inversión, correlación implícita).",
  "sectorConcentration": "Observación breve sobre concentración sectorial o temática del portfolio.",
  "keyOpportunities": ["oportunidad global 1", "oportunidad global 2"],
  "keyRisks": ["riesgo global 1", "riesgo global 2"],
  "portfolioSummaryText": "Análisis del portfolio como conjunto en 4-5 oraciones. Menciona el balance de escenarios, perfil de riesgo agregado y coherencia entre los horizontes de inversión.",
  "rebalancingHint": "Sugerencia breve de rebalanceo si existe un desequilibrio claro, o null si la cartera está razonablemente equilibrada."
}

overallSentiment: refleja el balance de escenarios y sentimiento noticioso del conjunto.
riskProfile: considera divergencias activas, concentración sectorial y mezcla de horizontes.
diversificationScore: 10 = perfectamente diversificada, 0 = altamente concentrada en un mismo sector/temática.
REGLAS: Sin recomendaciones específicas de compra/venta. Sin proyecciones de precio. Solo análisis informativo.`;

  try {
    const raw = await geminiChat(prompt, 1200, 3, {
      systemInstruction: SYSTEM_INSTRUCTION,
      jsonMode: true,
    });

    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const overallSentiment = parsed.overallSentiment;
    const riskProfile = parsed.riskProfile;

    return {
      overallSentiment:
        overallSentiment === "Optimista" || overallSentiment === "Conservador"
          ? overallSentiment
          : "Neutro",
      riskProfile:
        riskProfile === "Bajo" || riskProfile === "Alto" ? riskProfile : "Moderado",
      diversificationScore:
        typeof parsed.diversificationScore === "number"
          ? Math.max(0, Math.min(10, Math.round(parsed.diversificationScore * 10) / 10))
          : 5,
      diversificationComment:
        typeof parsed.diversificationComment === "string" ? parsed.diversificationComment : "",
      sectorConcentration:
        typeof parsed.sectorConcentration === "string" ? parsed.sectorConcentration : "",
      keyOpportunities: Array.isArray(parsed.keyOpportunities)
        ? parsed.keyOpportunities
            .filter((k): k is string => typeof k === "string")
            .slice(0, 3)
        : [],
      keyRisks: Array.isArray(parsed.keyRisks)
        ? parsed.keyRisks
            .filter((k): k is string => typeof k === "string")
            .slice(0, 3)
        : [],
      portfolioSummaryText:
        typeof parsed.portfolioSummaryText === "string" && parsed.portfolioSummaryText.trim()
          ? parsed.portfolioSummaryText
          : FALLBACK.portfolioSummaryText,
      rebalancingHint:
        typeof parsed.rebalancingHint === "string" && parsed.rebalancingHint.trim()
          ? parsed.rebalancingHint
          : null,
    };
  } catch {
    return FALLBACK;
  }
}
