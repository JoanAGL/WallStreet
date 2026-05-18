import { prisma } from "@/lib/prisma";
import type { StockAnalysisModel } from "@/types/models";

export interface UpsertAnalysisData {
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
  keyMetrics: string | null;
  metricsData: string | null;
  allHorizons: string | null;
}

export type PartialAnalysisData = Partial<Omit<UpsertAnalysisData, "stockId">>;

export async function upsertAnalysis(data: UpsertAnalysisData): Promise<StockAnalysisModel> {
  return prisma.stockAnalysis.upsert({
    where:  { stockId: data.stockId },
    update: { ...data, generatedAt: new Date() },
    create: { ...data, generatedAt: new Date() },
  }) as unknown as StockAnalysisModel;
}

export async function patchAnalysisFields(
  stockId: string,
  data: PartialAnalysisData
): Promise<StockAnalysisModel | null> {
  const existing = await prisma.stockAnalysis.findUnique({ where: { stockId } });
  if (!existing) return null;
  return prisma.stockAnalysis.update({
    where: { stockId },
    data,
  }) as unknown as StockAnalysisModel;
}

export async function getAnalysisByStockId(stockId: string): Promise<StockAnalysisModel | null> {
  return prisma.stockAnalysis.findUnique({
    where: { stockId },
  }) as unknown as StockAnalysisModel | null;
}

export async function getAnalysesForUser(
  userId: string
): Promise<(StockAnalysisModel & { stock: { ticker: string } })[]> {
  return prisma.stockAnalysis.findMany({
    where:   { stock: { userId } },
    include: { stock: { select: { ticker: true } } },
    orderBy: { stock: { createdAt: "asc" } },
  }) as unknown as (StockAnalysisModel & { stock: { ticker: string } })[];
}
