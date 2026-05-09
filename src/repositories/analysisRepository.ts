import { prisma } from "@/lib/prisma";
import type { StockAnalysis } from "@prisma/client";

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
}

export async function upsertAnalysis(
  data: UpsertAnalysisData
): Promise<StockAnalysis> {
  return prisma.stockAnalysis.upsert({
    where: { stockId: data.stockId },
    update: {
      ...data,
      generatedAt: new Date(),
    },
    create: {
      ...data,
      generatedAt: new Date(),
    },
  });
}

export async function getAnalysisByStockId(
  stockId: string
): Promise<StockAnalysis | null> {
  return prisma.stockAnalysis.findUnique({ where: { stockId } });
}

export async function getAnalysesForUser(
  userId: string
): Promise<(StockAnalysis & { stock: { ticker: string } })[]> {
  return prisma.stockAnalysis.findMany({
    where: { stock: { userId } },
    include: { stock: { select: { ticker: true } } },
    orderBy: { stock: { createdAt: "asc" } },
  });
}
