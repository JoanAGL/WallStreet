import { prisma } from "@/lib/prisma";
import type { StockAnalysisModel } from "@/types/models";

// El cliente Prisma generado tiene stockAnalysis en runtime aunque el TS server no lo vea
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stockAnalysis = (prisma as any).stockAnalysis as {
  upsert: (args: unknown) => Promise<StockAnalysisModel>;
  findUnique: (args: unknown) => Promise<StockAnalysisModel | null>;
  findMany: (args: unknown) => Promise<(StockAnalysisModel & { stock: { ticker: string } })[]>;
};

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
): Promise<StockAnalysisModel> {
  return stockAnalysis.upsert({
    where: { stockId: data.stockId },
    update: { ...data, generatedAt: new Date() },
    create: { ...data, generatedAt: new Date() },
  });
}

export async function getAnalysisByStockId(
  stockId: string
): Promise<StockAnalysisModel | null> {
  return stockAnalysis.findUnique({ where: { stockId } });
}

export async function getAnalysesForUser(
  userId: string
): Promise<(StockAnalysisModel & { stock: { ticker: string } })[]> {
  return stockAnalysis.findMany({
    where: { stock: { userId } },
    include: { stock: { select: { ticker: true } } },
    orderBy: { stock: { createdAt: "asc" } },
  });
}
