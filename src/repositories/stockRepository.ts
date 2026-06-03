import { prisma } from "@/lib/prisma";
import type { InvestmentHorizon, StockWithAnalysis } from "@/types/models";

export type { StockWithAnalysis };

export type PrismaStock = {
  id: string;
  ticker: string;
  userId: string;
  isin: string | null;
  name: string | null;
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

  const analyses = await prisma.stockAnalysis.findMany({
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

export async function findStockByIdAndUser(
  id: string,
  userId: string
): Promise<PrismaStock | null> {
  return prisma.stock.findFirst({
    where: { id, userId },
  }) as unknown as PrismaStock | null;
}

export async function updateStockQuantity(
  id: string,
  quantity: number
): Promise<PrismaStock> {
  return prisma.stock.update({
    where: { id },
    data:  { quantity },
  }) as unknown as PrismaStock;
}

export async function removeStockById(id: string): Promise<void> {
  await prisma.stock.delete({ where: { id } });
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
  return prisma.stock.update({
    where: { ticker_userId: { ticker, userId } },
    data,
  }) as unknown as PrismaStock;
}

export async function removeStock(ticker: string, userId: string): Promise<void> {
  await prisma.stock.delete({
    where: { ticker_userId: { ticker, userId } },
  });
}

export async function findStockByIsinAndUser(
  isin: string,
  userId: string
): Promise<PrismaStock | null> {
  return prisma.stock.findFirst({
    where: { isin, userId },
  }) as unknown as PrismaStock | null;
}
