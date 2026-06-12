/**
 * Tipos manuales que replican los modelos Prisma.
 * Se usan cuando el TS server no resuelve correctamente el cliente generado.
 */

export type InvestmentHorizon = "SHORT_TERM" | "MEDIUM_TERM" | "LONG_TERM";

import type { PriceRsiDivergence } from "@/services/technicalAnalysisService";
export type { PriceRsiDivergence };

// ── Señales algorítmicas (proyecciones cuantitativas, no asesoramiento financiero) ──

export type TradingAction = "COMPRA" | "VENTA" | "MANTENER" | "REDUCIR";

export interface AIPrescriptiveAction {
  ticker: string;
  action: TradingAction;
  confidenceScore: number;       // 0–100
  executionPriceLimit: number;   // nivel técnico de referencia
  quantitativeJustification: string;
  estimatedHorizonDays: number;
}

export const HORIZON_LABELS: Record<InvestmentHorizon, string> = {
  SHORT_TERM:  "Corto Plazo",
  MEDIUM_TERM: "Medio Plazo",
  LONG_TERM:   "Largo Plazo",
};

export interface StockAnalysisModel {
  id: string;
  stockId: string;
  price: number;
  priceUSD: number | null;
  currency: string;
  changePercent: number;
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
  marketRegime: string | null;   // CombinedMarketRegime (issue #49)
  newsSummary: string;
  newsSentiment: string;
  analysisText: string;
  scenarioLabel: string;
  scenarioJustification: string;
  divergenceAlert: PriceRsiDivergence | null;
  horizonMatch: string | null;
  keyMetrics: string | null;   // JSON string[]
  metricsData: string | null;  // JSON object with horizon-specific metrics
  allHorizons: string | null;  // JSON AllHorizonsAIAnalysis — analysis for all 3 horizons
  generatedAt: Date;
  updatedAt: Date;
}

export interface StockModel {
  id: string;
  ticker: string;
  userId: string;
  investmentHorizon: InvestmentHorizon;
  purchasePrice: number | null;
  purchaseDate: Date | null;
  quantity: number | null;
  currency: string;
  createdAt: Date;
}

export interface StockWithAnalysis extends StockModel {
  analysis: StockAnalysisModel | null;
}
