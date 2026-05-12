import { prisma } from "@/lib/prisma";
import type { PortfolioAIAnalysis } from "@/services/portfolioAIService";

const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

export interface PortfolioAnalysisRecord {
  id:           string;
  userId:       string;
  analysisJson: string;
  stockCount:   number;
  updatedAt:    Date;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const portfolioClient = (prisma as any).portfolioAnalysis as {
  findUnique: (args: unknown) => Promise<PortfolioAnalysisRecord | null>;
  upsert:     (args: unknown) => Promise<PortfolioAnalysisRecord>;
};

export async function getPortfolioAnalysis(
  userId: string
): Promise<PortfolioAnalysisRecord | null> {
  return portfolioClient.findUnique({ where: { userId } });
}

export function isPortfolioFresh(record: PortfolioAnalysisRecord | null): boolean {
  if (!record) return false;
  return Date.now() - new Date(record.updatedAt).getTime() < CACHE_TTL_MS;
}

export async function upsertPortfolioAnalysis(
  userId: string,
  analysis: PortfolioAIAnalysis,
  stockCount: number
): Promise<void> {
  const analysisJson = JSON.stringify(analysis);
  await portfolioClient.upsert({
    where:  { userId },
    create: { userId, analysisJson, stockCount },
    update: { analysisJson, stockCount },
  });
}
