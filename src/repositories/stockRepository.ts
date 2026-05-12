import { prisma } from "@/lib/prisma";
import type { InvestmentHorizon, StockWithAnalysis } from "@/types/models";

export type { StockWithAnalysis };

export type PrismaStock = {
  id: string;
  ticker: string;
  userId: string;
  investmentHorizon: InvestmentHorizon;
  purchasePrice: number | null;
  purchaseDate: Date | null;
  quantity: number | null;
  createdAt: Date;
};

export async function getStocksByUser(userId: string): Promise<PrismaStock[]> {
  return prisma.stock.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  }) as unknown as PrismaStock[];
}

export async function getStocksWithAnalysis(
  userId: string
): Promise<StockWithAnalysis[]> {
  const stocks = await prisma.stock.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  }) as unknown as PrismaStock[];

  if (stocks.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const analysisClient = (prisma as any).stockAnalysis;
  const analyses: Array<{ stockId: string } & Record<string, unknown>> =
    await analysisClient.findMany({
      where: { stockId: { in: stocks.map((s) => s.id) } },
    });

  const analysisMap = new Map(analyses.map((a) => [a.stockId, a]));

  return stocks.map((s) => ({
    ...s,
    analysis: (analysisMap.get(s.id) as unknown as StockWithAnalysis["analysis"]) ?? null,
  }));
}

export async function countStocksByUser(userId: string): Promise<number> {
  return prisma.stock.count({ where: { userId } });
}

export async function findStockByTickerAndUser(
  ticker: string,
  userId: string
): Promise<PrismaStock | null> {
  return prisma.stock.findUnique({
    where: { ticker_userId: { ticker, userId } },
  }) as unknown as PrismaStock | null;
}

export async function addStock(ticker: string, userId: string): Promise<PrismaStock> {
  return prisma.stock.create({ data: { ticker, userId } }) as unknown as PrismaStock;
}

export async function updateStockHorizon(
  ticker: string,
  userId: string,
  investmentHorizon: InvestmentHorizon
): Promise<PrismaStock> {
  return prisma.stock.update({
    where: { ticker_userId: { ticker, userId } },
    data: { investmentHorizon },
  }) as unknown as PrismaStock;
}

export async function updateStockPurchaseData(
  ticker: string,
  userId: string,
  data: { purchasePrice: number | null; quantity: number | null; purchaseDate: Date | null }
): Promise<PrismaStock> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.stock.update({
    where: { ticker_userId: { ticker, userId } },
    data: data as any,
  }) as unknown as PrismaStock;
}

export async function removeStock(ticker: string, userId: string): Promise<void> {
  await prisma.stock.delete({
    where: { ticker_userId: { ticker, userId } },
  });
}
