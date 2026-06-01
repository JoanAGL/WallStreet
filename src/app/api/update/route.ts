import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStocksByUser, type PrismaStock } from "@/repositories/stockRepository";
import { getAnalysesForUser } from "@/repositories/analysisRepository";
import {
  runAnalysisForStocks,
  runPortfolioOnlyAnalysis,
  type OrchestrationResult,
} from "@/services/analysisOrchestrator";
import { generatePortfolioAnalysis } from "@/services/portfolioAIService";
import { withTimeout } from "@/lib/withTimeout";
import {
  getPortfolioAnalysis,
  isPortfolioFresh,
  upsertPortfolioAnalysis,
} from "@/repositories/portfolioAnalysisRepository";
import type { AllHorizonsAIAnalysis } from "@/services/aiAnalysisService";
import type { InvestmentHorizon } from "@/types/models";
import type { UpdateType } from "@/types/updateTypes";
import { STOCK_UPDATE_TYPES } from "@/types/updateTypes";

const RATE_LIMIT_MS      = 5 * 60 * 1000; // full AI update: 5 min
const RATE_LIMIT_TICKER  = 1 * 60 * 1000; // per-ticker AI:  1 min

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const forceUpdate = req.nextUrl.searchParams.get("force") === "true";
  const userId = session.user.id;

  // Parse optional body
  const body = await req.json().catch(() => ({})) as {
    tickers?: string[];
    types?: UpdateType[];
  };

  const requestedTypes: UpdateType[] = Array.isArray(body.types) && body.types.length > 0
    ? body.types.filter((t): t is UpdateType => STOCK_UPDATE_TYPES.includes(t as UpdateType) || t === "portfolio")
    : ["price", "news", "technicals", "ai"];

  const requestedTickers: string[] | undefined =
    Array.isArray(body.tickers) && body.tickers.length > 0
      ? body.tickers.map((t) => t.toUpperCase())
      : undefined;

  // ── Portfolio-only path ──────────────────────────────────────────────────
  if (requestedTypes.length === 1 && requestedTypes[0] === "portfolio") {
    const result = await runPortfolioOnlyAnalysis(userId, forceUpdate);
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? "Error al regenerar análisis." }, { status: 500 });
    }
    return NextResponse.json({ message: "Análisis global regenerado.", updatedAt: new Date().toISOString() });
  }

  // ── Load user's stocks + risk profile ──────────────────────────────────
  const [allStocks, userProfileRow] = await Promise.all([
    getStocksByUser(userId),
    prisma.userProfile.findUnique({ where: { userId }, select: { riskLabel: true } }),
  ]);
  const riskProfile = userProfileRow?.riskLabel ?? null;
  if (allStocks.length === 0) {
    return NextResponse.json({ error: "No tienes acciones añadidas." }, { status: 400 });
  }

  const stocks = requestedTickers
    ? allStocks.filter((s) => requestedTickers.includes(s.ticker))
    : allStocks;

  if (stocks.length === 0) {
    return NextResponse.json({ error: "Ninguna de las acciones indicadas está en tu lista." }, { status: 400 });
  }

  // ── Rate limiting (only for AI calls) ───────────────────────────────────
  if (!forceUpdate && requestedTypes.includes("ai")) {
    const limit = requestedTickers ? RATE_LIMIT_TICKER : RATE_LIMIT_MS;
    const existingAnalyses = await getAnalysesForUser(userId);
    if (existingAnalyses.length > 0) {
      const mostRecent = existingAnalyses.reduce((latest, a) =>
        a.updatedAt > latest.updatedAt ? a : latest
      );
      const elapsed = Date.now() - mostRecent.updatedAt.getTime();
      if (elapsed < limit) {
        const waitSecs = Math.ceil((limit - elapsed) / 1000);
        return NextResponse.json(
          { error: `Demasiadas actualizaciones. Espera ${waitSecs} segundos.`, retryAfterSeconds: waitSecs },
          { status: 429 }
        );
      }
    }
  }

  // ── Run stock analysis ───────────────────────────────────────────────────
  const typesForStocks = requestedTypes.filter((t) => t !== "portfolio") as UpdateType[];
  const results = await runAnalysisForStocks(
    stocks.map((s) => ({ id: s.id, ticker: s.ticker, investmentHorizon: s.investmentHorizon, quantity: s.quantity })),
    forceUpdate,
    typesForStocks,
    riskProfile
  );

  // ── Portfolio analysis (auto after AI update with ≥2 stocks) ────────────
  if (requestedTypes.includes("ai")) {
    const successfulResults = results.filter((r) => r.success && r.analysis);
    if (successfulResults.length >= 2) {
      try {
        const portfolioRecord = await getPortfolioAnalysis(userId);
        if (forceUpdate || !isPortfolioFresh(portfolioRecord)) {
          const stockMap = new Map(allStocks.map((s) => [s.id, s]));
          const inputs = buildPortfolioInputs(successfulResults, stockMap);
          const portfolioAnalysis = await withTimeout(
            generatePortfolioAnalysis(inputs),
            30_000,
            "Gemini:portfolio"
          );
          await upsertPortfolioAnalysis(userId, portfolioAnalysis, inputs.length);
        }
      } catch (e) {
        console.warn("[UPDATE] Portfolio analysis failed:", e);
      }
    }
  }

  const succeeded = results.filter((r) => r.success && !r.skipped).length;
  const cached    = results.filter((r) => r.skipped).length;
  const failed    = results.filter((r) => !r.success);

  return NextResponse.json({
    message:   "Actualización completada",
    types:     typesForStocks,
    succeeded,
    cached,
    failed:    failed.map((f) => ({ ticker: f.ticker, error: f.error, dataIssues: f.dataIssues })),
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
        ticker: r.ticker, price: a.price, changePercent: a.changePercent,
        investmentHorizon: horizon, scenarioLabel, scenarioJustification,
        divergenceAlert: a.divergenceAlert, newsSentiment: a.newsSentiment, keyMetrics,
        purchasePrice, quantity, costBasis, currentValue, pnl, pnlPct,
      };
    });
}
