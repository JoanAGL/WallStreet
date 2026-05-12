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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const historyClient = (prisma as any).stockAnalysisHistory as {
  create:    (args: unknown) => Promise<SnapshotRecord>;
  findMany:  (args: unknown) => Promise<SnapshotRecord[]>;
  deleteMany:(args: unknown) => Promise<{ count: number }>;
  count:     (args: unknown) => Promise<number>;
};

export async function insertSnapshot(data: SnapshotData): Promise<void> {
  await historyClient.create({ data });
  await pruneHistory(data.stockId);
}

export async function getStockHistory(
  stockId: string,
  limit = HISTORY_LIMIT
): Promise<SnapshotRecord[]> {
  return historyClient.findMany({
    where:   { stockId },
    orderBy: { snapshotAt: "desc" },
    take:    limit,
  });
}

async function pruneHistory(stockId: string): Promise<void> {
  const total = await historyClient.count({ where: { stockId } });
  if (total <= HISTORY_LIMIT) return;

  const oldest = await historyClient.findMany({
    where:   { stockId },
    orderBy: { snapshotAt: "asc" },
    take:    total - HISTORY_LIMIT,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any[];

  if (oldest.length === 0) return;
  await historyClient.deleteMany({
    where: { id: { in: oldest.map((r: { id: string }) => r.id) } },
  });
}
