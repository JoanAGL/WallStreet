import { prisma } from "@/lib/prisma";

export interface ManualSellRecord {
  id:               string;
  userId:           string;
  ticker:           string;
  shares:           number;
  avgBuyPrice:      number;
  sellPrice:        number;
  investedAmount:   number;
  revenueAmount:    number;
  profitAmount:     number;
  profitPercentage: number;
  date:             Date;
  notes:            string | null;
  createdAt:        Date;
}

export async function createManualSell(data: {
  userId:      string;
  ticker:      string;
  shares:      number;
  avgBuyPrice: number;
  sellPrice:   number;
  date?:       Date | null;
  notes?:      string | null;
}): Promise<ManualSellRecord> {
  const investedAmount   = Math.round(data.shares * data.avgBuyPrice * 100) / 100;
  const revenueAmount    = Math.round(data.shares * data.sellPrice   * 100) / 100;
  const profitAmount     = Math.round((revenueAmount - investedAmount) * 100) / 100;
  const profitPercentage = investedAmount > 0
    ? Math.round((profitAmount / investedAmount) * 10000) / 100
    : 0;

  return prisma.manualSellEntry.create({
    data: {
      userId:      data.userId,
      ticker:      data.ticker.toUpperCase().trim(),
      shares:      data.shares,
      avgBuyPrice: data.avgBuyPrice,
      sellPrice:   data.sellPrice,
      investedAmount,
      revenueAmount,
      profitAmount,
      profitPercentage,
      date:        data.date ?? new Date(),
      notes:       data.notes ?? null,
    },
  });
}

export async function getManualSellsByUser(userId: string): Promise<ManualSellRecord[]> {
  return prisma.manualSellEntry.findMany({
    where:   { userId },
    orderBy: { date: "desc" },
  });
}

export async function findManualSellByIdAndUser(
  id:     string,
  userId: string,
): Promise<ManualSellRecord | null> {
  return prisma.manualSellEntry.findFirst({ where: { id, userId } });
}

export async function deleteManualSell(id: string): Promise<void> {
  await prisma.manualSellEntry.delete({ where: { id } });
}
