/**
 * Tipos manuales que replican los modelos Prisma.
 * Se usan cuando el TS server no resuelve correctamente el cliente generado.
 */

export type InvestmentHorizon = "SHORT_TERM" | "MEDIUM_TERM" | "LONG_TERM";

export const HORIZON_LABELS: Record<InvestmentHorizon, string> = {
  SHORT_TERM:  "Corto Plazo",
  MEDIUM_TERM: "Medio Plazo",
  LONG_TERM:   "Largo Plazo",
};

export interface StockAnalysisModel {
  id: string;
  stockId: string;
  price: number;
  changePercent: number;
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
  newsSummary: string;
  newsSentiment: string;
  analysisText: string;
  scenarioLabel: string;
  scenarioJustification: string;
  divergenceAlert: boolean;
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
  createdAt: Date;
}

export interface StockWithAnalysis extends StockModel {
  analysis: StockAnalysisModel | null;
}
