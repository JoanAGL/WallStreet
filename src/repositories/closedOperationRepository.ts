import { prisma } from "@/lib/prisma";

export interface ClosedOperationData {
  stockId: string;
  ticker: string;
  shares: number;
  buyPrice: number;
  sellPrice: number;
  investedAmount: number;
  revenueAmount: number;
  profitAmount: number;
  profitPercentage: number;
}

export interface ClosedOperationRecord extends ClosedOperationData {
  id: string;
  closedAt: Date;
}

export async function createClosedOperation(
  data: ClosedOperationData
): Promise<ClosedOperationRecord> {
  return prisma.closedOperation.create({ data }) as unknown as ClosedOperationRecord;
}

export async function getClosedOperationsByUser(
  userId: string
): Promise<ClosedOperationRecord[]> {
  return prisma.closedOperation.findMany({
    where:   { stock: { userId } },
    orderBy: { closedAt: "desc" },
  }) as unknown as ClosedOperationRecord[];
}

export async function getClosedOperationsByStock(
  stockId: string
): Promise<ClosedOperationRecord[]> {
  return prisma.closedOperation.findMany({
    where:   { stockId },
    orderBy: { closedAt: "desc" },
  }) as unknown as ClosedOperationRecord[];
}
