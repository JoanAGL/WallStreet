import { prisma } from "@/lib/prisma";
import type { Stock } from "@prisma/client";

export async function getStocksByUser(userId: string): Promise<Stock[]> {
  return prisma.stock.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
}

export async function countStocksByUser(userId: string): Promise<number> {
  return prisma.stock.count({ where: { userId } });
}

export async function findStockByTickerAndUser(
  ticker: string,
  userId: string
): Promise<Stock | null> {
  return prisma.stock.findUnique({
    where: { ticker_userId: { ticker, userId } },
  });
}

export async function addStock(
  ticker: string,
  userId: string
): Promise<Stock> {
  return prisma.stock.create({ data: { ticker, userId } });
}

export async function removeStock(
  ticker: string,
  userId: string
): Promise<void> {
  await prisma.stock.delete({
    where: { ticker_userId: { ticker, userId } },
  });
}
