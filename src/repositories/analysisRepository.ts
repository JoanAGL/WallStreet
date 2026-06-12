import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { StockAnalysisModel } from "@/types/models";
import type { PriceRsiDivergence } from "@/services/technicalAnalysisService";

export interface UpsertAnalysisData {
  stockId: string;
  price: number;
  priceUSD: number | null;
  currency: string;
  changePercent: number;
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
  marketRegime: string | null;
  newsSummary: string;
  newsSentiment: string;
  analysisText: string;
  scenarioLabel: string;
  scenarioJustification: string;
  divergenceAlert: PriceRsiDivergence | null;
  horizonMatch: string | null;
  keyMetrics: string | null;
  metricsData: string | null;
  allHorizons: string | null;
}

export type PartialAnalysisData = Partial<Omit<UpsertAnalysisData, "stockId">>;

// Prisma's Json? column requires:
//   null  → Prisma.JsonNull (sentinel — NOT plain null)
//   value → cast to Prisma.InputJsonValue (our typed struct is JSON-serializable)
function encodeDivergence(
  v: PriceRsiDivergence | null | undefined
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (v === undefined) return undefined;
  if (v === null)      return Prisma.JsonNull;
  return v as unknown as Prisma.InputJsonValue;
}

export async function upsertAnalysis(data: UpsertAnalysisData): Promise<StockAnalysisModel> {
  const { divergenceAlert, ...rest } = data;
  const payload = { ...rest, divergenceAlert: encodeDivergence(divergenceAlert) };
  return prisma.stockAnalysis.upsert({
    where:  { stockId: data.stockId },
    update: { ...payload, generatedAt: new Date() },
    create: { ...payload, generatedAt: new Date() },
  }) as unknown as StockAnalysisModel;
}

export async function patchAnalysisFields(
  stockId: string,
  data: PartialAnalysisData
): Promise<StockAnalysisModel | null> {
  const existing = await prisma.stockAnalysis.findUnique({ where: { stockId } });
  if (!existing) return null;
  const { divergenceAlert, ...rest } = data;
  const patch = "divergenceAlert" in data
    ? { ...rest, divergenceAlert: encodeDivergence(divergenceAlert) }
    : rest;
  return prisma.stockAnalysis.update({
    where: { stockId },
    data:  patch,
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
