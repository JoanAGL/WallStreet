import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStocksByUser, type PrismaStock } from "@/repositories/stockRepository";
import { getAnalysesForUser } from "@/repositories/analysisRepository";
import { runAnalysisForStocks } from "@/services/analysisOrchestrator";
import { generatePortfolioAnalysis } from "@/services/portfolioAIService";
import {
  getPortfolioAnalysis,
  isPortfolioFresh,
  upsertPortfolioAnalysis,
} from "@/repositories/portfolioAnalysisRepository";
import type { OrchestrationResult } from "@/services/analysisOrchestrator";
import type { AllHorizonsAIAnalysis } from "@/services/aiAnalysisService";
import type { InvestmentHorizon } from "@/types/models";

const RATE_LIMIT_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const forceUpdate = req.nextUrl.searchParams.get("force") === "true";
  const userId = session.user.id;

  if (!forceUpdate) {
    const existingAnalyses = await getAnalysesForUser(userId);
    if (existingAnalyses.length > 0) {
      const mostRecent = existingAnalyses.reduce((latest, a) =>
        a.updatedAt > latest.updatedAt ? a : latest
      );
      const elapsed = Date.now() - mostRecent.updatedAt.getTime();
      if (elapsed < RATE_LIMIT_MS) {
        const waitSecs = Math.ceil((RATE_LIMIT_MS - elapsed) / 1000);
        return NextResponse.json(
          { error: `Demasiadas actualizaciones. Espera ${waitSecs} segundos.`, retryAfterSeconds: waitSecs },
          { status: 429 }
        );
      }
    }
  }

  const stocks = await getStocksByUser(userId);
  if (stocks.length === 0) {
    return NextResponse.json({ error: "No tienes acciones añadidas." }, { status: 400 });
  }

  const results = await runAnalysisForStocks(
    stocks.map((s) => ({ id: s.id, ticker: s.ticker, investmentHorizon: s.investmentHorizon })),
    forceUpdate
  );

  // Portfolio analysis — triggered if ≥ 2 stocks have analysis (non-fatal)
  const successfulResults = results.filter((r) => r.success && r.analysis);
  if (successfulResults.length >= 2) {
    try {
      const portfolioRecord = await getPortfolioAnalysis(userId);
      if (forceUpdate || !isPortfolioFresh(portfolioRecord)) {
        const stockMap = new Map(stocks.map((s) => [s.id, s]));
        const inputs = buildPortfolioInputs(successfulResults, stockMap);
        const portfolioAnalysis = await generatePortfolioAnalysis(inputs);
        await upsertPortfolioAnalysis(userId, portfolioAnalysis, inputs.length);
      }
    } catch (e) {
      console.warn("[UPDATE] Portfolio analysis failed:", e);
    }
  }

  const succeeded = results.filter((r) => r.success && !r.skipped).length;
  const cached    = results.filter((r) => r.skipped).length;
  const failed    = results.filter((r) => !r.success);

  return NextResponse.json({
    message: "Actualización completada",
    succeeded,
    cached,
    failed: failed.map((f) => ({ ticker: f.ticker, error: f.error, dataIssues: f.dataIssues })),
    updatedAt: new Date().toISOString(),
  });
}

function buildPortfolioInputs(
  results: OrchestrationResult[],
  stockMap: Map<string, PrismaStock>
) {
  return results
    .filter((r) => r.success && r.analysis)
    .map((r) => {
      const a = r.analysis!;
      const stock = stockMap.get(r.stockId);
      const horizon: InvestmentHorizon = stock?.investmentHorizon ?? "SHORT_TERM";

      let scenarioLabel: "Positivo" | "Neutral" | "Negativo" = "Neutral";
      let scenarioJustification = "";
      let keyMetrics: string[] = [];

      if (a.allHorizons) {
        try {
          const all = JSON.parse(a.allHorizons) as AllHorizonsAIAnalysis;
          const hKey =
            horizon === "MEDIUM_TERM" ? "mediumTerm" :
            horizon === "LONG_TERM"   ? "longTerm"   : "shortTerm";
          const h = all[hKey];
          if (h.scenarioLabel === "Positivo" || h.scenarioLabel === "Negativo") {
            scenarioLabel = h.scenarioLabel;
          }
          scenarioJustification = h.scenarioJustification;
          keyMetrics = h.keyMetrics;
        } catch { /* use defaults */ }
      } else {
        const sl = a.scenarioLabel;
        if (sl === "Positivo" || sl === "Negativo") scenarioLabel = sl;
        scenarioJustification = a.scenarioJustification;
        try { keyMetrics = a.keyMetrics ? JSON.parse(a.keyMetrics) as string[] : []; } catch { /* ignore */ }
      }

      const purchasePrice = stock?.purchasePrice ?? null;
      const quantity      = stock?.quantity      ?? null;
      const costBasis     = purchasePrice != null && quantity != null ? purchasePrice * quantity : null;
      const currentValue  = quantity != null ? a.price * quantity : null;
      const pnl           = costBasis != null && currentValue != null ? currentValue - costBasis : null;
      const pnlPct        = pnl != null && costBasis && costBasis !== 0 ? (pnl / costBasis) * 100 : null;

      return {
        ticker:               r.ticker,
        price:                a.price,
        changePercent:        a.changePercent,
        investmentHorizon:    horizon,
        scenarioLabel,
        scenarioJustification,
        divergenceAlert:      a.divergenceAlert,
        newsSentiment:        a.newsSentiment,
        keyMetrics,
        purchasePrice,
        quantity,
        costBasis,
        currentValue,
        pnl,
        pnlPct,
      };
    });
}
