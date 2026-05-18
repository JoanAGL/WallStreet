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

export async function getPortfolioAnalysis(
  userId: string
): Promise<PortfolioAnalysisRecord | null> {
  return prisma.portfolioAnalysis.findUnique({
    where: { userId },
  }) as unknown as PortfolioAnalysisRecord | null;
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
  await prisma.portfolioAnalysis.upsert({
    where:  { userId },
    create: { userId, analysisJson, stockCount },
    update: { analysisJson, stockCount },
  });
}
