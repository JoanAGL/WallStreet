import { prisma } from "@/lib/prisma";

const HISTORY_LIMIT = 30;

export interface SnapshotData {
  stockId:       string;
  price:         number;
  changePercent: number;
  scenarioLabel: string;
  horizonUsed:   string;
  rsi14:         number | null;
}

export interface SnapshotRecord extends SnapshotData {
  id:         string;
  snapshotAt: Date;
}

export async function insertSnapshot(data: SnapshotData): Promise<void> {
  await prisma.stockAnalysisHistory.create({ data });
  await pruneHistory(data.stockId);
}

export async function getStockHistory(
  stockId: string,
  limit = HISTORY_LIMIT
): Promise<SnapshotRecord[]> {
  return prisma.stockAnalysisHistory.findMany({
    where:   { stockId },
    orderBy: { snapshotAt: "desc" },
    take:    limit,
  }) as unknown as SnapshotRecord[];
}

async function pruneHistory(stockId: string): Promise<void> {
  const total = await prisma.stockAnalysisHistory.count({ where: { stockId } });
  if (total <= HISTORY_LIMIT) return;

  const oldest = await prisma.stockAnalysisHistory.findMany({
    where:   { stockId },
    orderBy: { snapshotAt: "asc" },
    take:    total - HISTORY_LIMIT,
    select:  { id: true },
  });

  if (oldest.length === 0) return;
  await prisma.stockAnalysisHistory.deleteMany({
    where: { id: { in: oldest.map((r) => r.id) } },
  });
}
