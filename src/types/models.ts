/**
 * Tipos manuales que replican los modelos Prisma.
 * Se usan cuando el TS server no resuelve correctamente el cliente generado.
 */

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
  generatedAt: Date;
  updatedAt: Date;
}

export interface StockModel {
  id: string;
  ticker: string;
  userId: string;
  createdAt: Date;
}

export interface StockWithAnalysis extends StockModel {
  analysis: StockAnalysisModel | null;
}
