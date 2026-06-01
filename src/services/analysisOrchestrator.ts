import { getCurrentQuote, getHistoricalCloses } from "./marketDataService";
import type { CurrentQuote, HistoricalData } from "./marketDataService";
import { withTimeout } from "@/lib/withTimeout";
import { calculateIndicators } from "./technicalAnalysisService";
import { analyzeNewsForTicker, fetchArticlesForTicker, batchAnalyzeSentiment } from "./newsAnalysisService";
import type { DataIssue, NewsAnalysis } from "./newsAnalysisService";
import { batchGenerateAllHorizons, FALLBACK_HORIZON } from "./aiAnalysisService";
import type { AllHorizonsAIAnalysis, HorizonAnalysis, BatchStockInput, DataQuality } from "./aiAnalysisService";
import { calculatePortfolioQuantMetrics, findTickerMetrics, calculateFearGreedScore } from "./quantitativeService";
import { getGlobalContext } from "./macroService";
import type { MacroGlobalContext } from "./macroService";
import { EarningsService } from "./earningsService";
import { fetchAllFundamentals } from "@/lib/yahooFinanceClient";
import type { AllFundamentals } from "@/lib/yahooFinanceClient";
import {
  upsertAnalysis,
  patchAnalysisFields,
  getAnalysisByStockId,
} from "@/repositories/analysisRepository";
import { insertSnapshot } from "@/repositories/analysisHistoryRepository";
import {
  getPortfolioAnalysis,
  isPortfolioFresh,
  upsertPortfolioAnalysis,
} from "@/repositories/portfolioAnalysisRepository";
import { getStocksWithAnalysis } from "@/repositories/stockRepository";
import { generatePortfolioAnalysis } from "@/services/portfolioAIService";
import type { StockAnalysisModel, InvestmentHorizon } from "@/types/models";
import type { UpdateType } from "@/types/updateTypes";

const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

// ── Per-service timeout budgets (ms) ─────────────────────────────────────────
const TIMEOUTS = {
  quote:           3_000,   // Finnhub real-time quote
  historical:      8_000,   // Yahoo Finance candlestick data
  fundamentals:    6_000,   // Yahoo Finance quoteSummary
  news:            5_000,   // NewsAPI article fetch
  geminiPerStock: 25_000,   // Gemini per-stock (used to scale batch budget)
  geminiPortfolio:30_000,   // Gemini portfolio analysis
} as const;

// ── Typed fallbacks — allow partial-data analysis when an API source fails ───
interface DefaultFallbacks {
  quote(ticker: string): CurrentQuote;
  historical(ticker: string): HistoricalData;
  fundamentals: import("@/lib/yahooFinanceClient").AllFundamentals;
}

const DEFAULT_FALLBACKS: DefaultFallbacks = {
  quote: (ticker) => ({
    ticker,
    price:         0,
    previousClose: 0,
    change:        0,
    changePercent: 0,
    fetchedAt:     new Date().toISOString(),
  }),
  historical: (ticker) => ({
    ticker,
    closes:  [],
    highs:   [],
    lows:    [],
    volumes: [],
    dates:   [],
  }),
  fundamentals: {
    medium: {
      revenueGrowthYoY: null,
      forwardEps:       null,
      pegRatio:         null,
      debtToEquity:     null,
      returnOnEquity:   null,
    },
    long: {
      trailingPE:        null,
      dividendYield:     null,
      profitMargin:      null,
      freeCashflowYield: null,
      beta:              null,
    },
  },
};

export interface OrchestrationResult {
  ticker: string;
  stockId: string;
  success: boolean;
  skipped?: boolean;
  error?: string;
  analysis?: StockAnalysisModel;
  dataIssues?: DataIssue[];
}

type StockInput = { id: string; ticker: string; investmentHorizon?: InvestmentHorizon; quantity?: number | null };

// ── Public API ────────────────────────────────────────────────────────────────

export async function runAnalysisForStock(
  stockId: string,
  ticker: string,
  forceUpdate = false,
  investmentHorizon: InvestmentHorizon = "SHORT_TERM"
): Promise<OrchestrationResult> {
  const results = await runAnalysisForStocks(
    [{ id: stockId, ticker, investmentHorizon }],
    forceUpdate
  );
  return results[0];
}

export async function runAnalysisForStocks(
  stocks: StockInput[],
  forceUpdate = false,
  types: UpdateType[] = ["price", "news", "technicals", "ai"],
  riskProfile?: string | null
): Promise<OrchestrationResult[]> {
  if (stocks.length === 0) return [];

  // Full AI pipeline
  if (types.includes("ai")) {
    return runFullAnalysis(stocks, forceUpdate, riskProfile);
  }

  // Partial update path (price / news / technicals — no Gemini per-stock call)
  return runPartialAnalysis(stocks, types);
}

/**
 * Regenerates portfolio analysis from existing DB data — no stock data re-fetch.
 */
export async function runPortfolioOnlyAnalysis(
  userId: string,
  force = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const portfolioRecord = await getPortfolioAnalysis(userId);
    if (!force && isPortfolioFresh(portfolioRecord)) {
      return { success: true };
    }

    const stocks = await getStocksWithAnalysis(userId);
    const withAnalysis = stocks.filter((s) => s.analysis);
    if (withAnalysis.length < 2) {
      return { success: false, error: "Se necesitan al menos 2 acciones con análisis." };
    }

    const inputs = withAnalysis.map((s) => {
      const a = s.analysis!;
      let scenarioLabel: "Positivo" | "Neutral" | "Negativo" = "Neutral";
      let scenarioJustification = "";
      let keyMetrics: string[] = [];

      if (a.allHorizons) {
        try {
          const all = JSON.parse(a.allHorizons) as AllHorizonsAIAnalysis;
          const hKey =
            s.investmentHorizon === "MEDIUM_TERM" ? "mediumTerm" :
            s.investmentHorizon === "LONG_TERM"   ? "longTerm"   : "shortTerm";
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

      const purchasePrice = s.purchasePrice ?? null;
      const quantity      = s.quantity      ?? null;
      const costBasis     = purchasePrice != null && quantity != null ? purchasePrice * quantity : null;
      const currentValue  = quantity != null ? a.price * quantity : null;
      const pnl           = costBasis != null && currentValue != null ? currentValue - costBasis : null;
      const pnlPct        = pnl != null && costBasis && costBasis !== 0 ? (pnl / costBasis) * 100 : null;

      return {
        ticker: s.ticker,
        price: a.price,
        changePercent: a.changePercent,
        investmentHorizon: s.investmentHorizon,
        scenarioLabel,
        scenarioJustification,
        divergenceAlert: a.divergenceAlert,
        newsSentiment: a.newsSentiment,
        keyMetrics,
        purchasePrice,
        quantity,
        costBasis,
        currentValue,
        pnl,
        pnlPct,
      };
    });

    const portfolioAnalysis = await withTimeout(
      generatePortfolioAnalysis(inputs),
      TIMEOUTS.geminiPortfolio,
      "Gemini:portfolio"
    );
    await upsertPortfolioAnalysis(userId, portfolioAnalysis, inputs.length);
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ORCHESTRATOR] Portfolio-only analysis failed:", msg);
    return { success: false, error: msg };
  }
}

// ── Full pipeline (includes Gemini per-stock AI) ──────────────────────────────

async function runFullAnalysis(
  stocks: StockInput[],
  forceUpdate: boolean,
  riskProfile?: string | null
): Promise<OrchestrationResult[]> {
  // Phase 1: Freshness check
  const freshnessResults = await Promise.allSettled(
    stocks.map((s) => getAnalysisByStockId(s.id))
  );

  const staleStocks: StockInput[] = [];
  const finalResults: OrchestrationResult[] = [];

  stocks.forEach((stock, i) => {
    const cached = freshnessResults[i].status === "fulfilled" ? freshnessResults[i].value : null;
    if (isFresh(cached, forceUpdate)) {
      finalResults.push({ ticker: stock.ticker, stockId: stock.id, success: true, skipped: true, analysis: cached! });
    } else {
      staleStocks.push(stock);
    }
  });

  if (staleStocks.length === 0) return finalResults;
  console.log(`[ORCHESTRATOR] ${staleStocks.length} stale / ${finalResults.length} cached (force=${forceUpdate})`);

  // Phase 2: Market data + fundamentals (parallel, individual timeouts per source)
  // Each source is wrapped with withTimeout so a single slow API cannot block
  // the whole batch. Failures degrade gracefully via DEFAULT_FALLBACKS, allowing
  // Gemini to run with partial data and dataQuality to surface what is missing.
  type MarketData = {
    stock: StockInput;
    quote: CurrentQuote;
    indicators: ReturnType<typeof calculateIndicators>;
    allFundamentals: AllFundamentals;
    dataQuality: DataQuality;
  };

  const marketResults = await Promise.allSettled(
    staleStocks.map(async (stock): Promise<MarketData> => {
      const [quoteResult, historicalResult, fundamentalsResult] = await Promise.allSettled([
        withTimeout(getCurrentQuote(stock.ticker),         TIMEOUTS.quote,        `Finnhub:${stock.ticker}`),
        withTimeout(getHistoricalCloses(stock.ticker, 60), TIMEOUTS.historical,   `Yahoo:historical:${stock.ticker}`),
        withTimeout(fetchAllFundamentals(stock.ticker),    TIMEOUTS.fundamentals, `Yahoo:fundamentals:${stock.ticker}`),
      ]);

      if (quoteResult.status        === "rejected") console.warn(`[ORCHESTRATOR] Quote fallback for ${stock.ticker}:`,        quoteResult.reason);
      if (historicalResult.status   === "rejected") console.warn(`[ORCHESTRATOR] Historical fallback for ${stock.ticker}:`,   historicalResult.reason);
      if (fundamentalsResult.status === "rejected") console.warn(`[ORCHESTRATOR] Fundamentals fallback for ${stock.ticker}:`, fundamentalsResult.reason);

      const quote           = quoteResult.status        === "fulfilled" ? quoteResult.value        : DEFAULT_FALLBACKS.quote(stock.ticker);
      const historical      = historicalResult.status   === "fulfilled" ? historicalResult.value   : DEFAULT_FALLBACKS.historical(stock.ticker);
      const allFundamentals = fundamentalsResult.status === "fulfilled" ? fundamentalsResult.value : DEFAULT_FALLBACKS.fundamentals;

      const dataQuality: DataQuality = {
        technical:    historicalResult.status === "fulfilled" && historical.closes.length > 0,
        fundamentals: fundamentalsResult.status === "fulfilled",
        news:         true, // refined in Phase 5 once article results are available
        degraded:     quoteResult.status === "rejected" || historicalResult.status === "rejected",
      };

      return {
        stock,
        quote,
        allFundamentals,
        indicators: calculateIndicators(
          stock.ticker,
          historical.closes,
          historical.highs,
          historical.lows,
          historical.volumes
        ),
        dataQuality,
      };
    })
  );

  const withMarket: MarketData[] = [];
  marketResults.forEach((r, i) => {
    if (r.status === "rejected") {
      // Only truly unexpected errors reach here now (e.g. OOM, thrown inside calculateIndicators)
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.error(`[ORCHESTRATOR] Unexpected market error for ${staleStocks[i].ticker}: ${msg}`);
      finalResults.push({
        ticker: staleStocks[i].ticker, stockId: staleStocks[i].id,
        success: false, error: msg,
        dataIssues: [{ kind: "API_ERROR", source: "market", message: msg }],
      });
    } else {
      withMarket.push(r.value);
    }
  });

  if (withMarket.length === 0) return finalResults;

  // Phase 2c: Fetch macro context once (4h cache — no extra latency on cache hit)
  let macroContext: MacroGlobalContext | null = null;
  try {
    macroContext = await getGlobalContext();
  } catch (err) {
    console.warn("[ORCHESTRATOR] MacroService failed, continuing without macro context:", err);
  }

  // Phase 2b: Compute portfolio-wide quant metrics using historical data from all stale stocks
  const quantHistoricalData: Record<string, number[]> = {};
  const quantCurrentPrices:  Record<string, number>   = {};
  const quantQuantities:     Record<string, number>   = {};
  for (const { stock, quote } of withMarket) {
    quantCurrentPrices[stock.ticker] = quote.price;
    quantQuantities[stock.ticker]    = stock.quantity ?? 0;
  }
  // Fetch historical closes for quant (re-uses Next.js fetch cache from Phase 2)
  await Promise.allSettled(
    withMarket.map(async ({ stock }) => {
      try {
        const h = await withTimeout(getHistoricalCloses(stock.ticker, 30), TIMEOUTS.historical, `Yahoo:quant:${stock.ticker}`);
        if (h.closes.length >= 5) quantHistoricalData[stock.ticker] = h.closes;
      } catch { /* skip */ }
    })
  );
  const allQuantMetrics = calculatePortfolioQuantMetrics(
    quantHistoricalData, quantCurrentPrices, quantQuantities
  );

  // Phase 3: Fetch news articles (NewsAPI only, no Gemini) + earnings in parallel
  const [articleResults, earningsResults] = await Promise.all([
    Promise.allSettled(
      withMarket.map(({ stock }) =>
        withTimeout(fetchArticlesForTicker(stock.ticker), TIMEOUTS.news, `NewsAPI:${stock.ticker}`)
      )
    ),
    Promise.allSettled(
      withMarket.map(({ stock }) =>
        EarningsService.getGuidanceInsight(stock.ticker).catch(() => null)
      )
    ),
  ]);

  // Phase 4: Batch news sentiment — ONE Gemini call for all tickers with articles
  const newsArticleInputs: Array<{ ticker: string; articles: import("./newsAnalysisService").NewsArticle[] }> = [];
  const newsAnalysisMap = new Map<string, NewsAnalysis>();
  const now = new Date().toISOString();

  withMarket.forEach(({ stock }, i) => {
    const r = articleResults[i];
    if (r.status === "fulfilled") {
      const { articles, dataIssue } = r.value;
      if (articles.length > 0) {
        newsArticleInputs.push({ ticker: stock.ticker, articles });
      }
      // Placeholder — sentiment will be filled after batch call
      newsAnalysisMap.set(stock.ticker, {
        ticker: stock.ticker, articles,
        summary: "Pendiente de análisis.", sentiment: "Neutral",
        analyzedAt: now, dataIssue,
      });
    } else {
      const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
      newsAnalysisMap.set(stock.ticker, {
        ticker: stock.ticker, articles: [],
        summary: "Error al obtener noticias.", sentiment: "Neutral",
        analyzedAt: now,
        dataIssue: { kind: "API_ERROR", source: "news", message },
      });
    }
  });

  if (newsArticleInputs.length > 0) {
    const batchSentiments = await batchAnalyzeSentiment(newsArticleInputs);
    batchSentiments.forEach((result, ticker) => {
      const existing = newsAnalysisMap.get(ticker);
      if (existing) {
        newsAnalysisMap.set(ticker, { ...existing, summary: result.summary, sentiment: result.sentiment });
      }
    });
  }

  // Phase 5: Build batch inputs and run batch all-horizons AI (ceil(N/4) Gemini calls)
  const batchInputs: BatchStockInput[] = withMarket.map(({ stock, quote, indicators, allFundamentals, dataQuality }, i) => {
    const quantMetrics = findTickerMetrics(allQuantMetrics, stock.ticker);
    const newsAnalysis = newsAnalysisMap.get(stock.ticker)!;
    const sentiment = newsAnalysis.sentiment as "Positivo" | "Neutral" | "Negativo";
    const fearGreedScore = indicators.rsi14 != null
      ? calculateFearGreedScore(indicators.rsi14, sentiment)
      : null;
    const earningsResult = earningsResults[i];
    const earningsGuidance = earningsResult.status === "fulfilled" ? earningsResult.value : null;

    // Finalise dataQuality.news now that article results are available
    const newsOk = articleResults[i].status === "fulfilled";
    const finalDataQuality: DataQuality = {
      ...dataQuality,
      news:     newsOk,
      degraded: dataQuality.degraded || !newsOk,
    };

    return {
      ticker: stock.ticker,
      price: quote.price,
      changePercent: quote.changePercent,
      indicators,
      newsAnalysis,
      allFundamentals,
      riskProfile,
      quantMetrics,
      fearGreedScore,
      earningsGuidance,
      dataQuality: finalDataQuality,
    };
  });

  const allHorizonsMap = await withTimeout(
    batchGenerateAllHorizons(batchInputs, macroContext),
    TIMEOUTS.geminiPerStock * batchInputs.length,
    `Gemini:batch:${batchInputs.length}`
  ).catch((err: unknown) => {
    console.warn(`[ORCHESTRATOR] Gemini batch timed out: ${err instanceof Error ? err.message : err}`);
    return new Map<string, AllHorizonsAIAnalysis>();
  });

  // Phase 6: Persist results in parallel
  const persistResults = await Promise.allSettled(
    withMarket.map(async ({ stock, quote, indicators, allFundamentals }) => {
      const horizon: InvestmentHorizon = stock.investmentHorizon ?? "SHORT_TERM";
      const newsAnalysis = newsAnalysisMap.get(stock.ticker)!;
      const allAI = allHorizonsMap.get(stock.ticker) ?? {
        shortTerm: FALLBACK_HORIZON, mediumTerm: FALLBACK_HORIZON, longTerm: FALLBACK_HORIZON,
      };
      const active = horizonToAI(allAI, horizon);
      const metricsData = buildMetricsData(horizon, indicators, allFundamentals);

      const analysis = await upsertAnalysis({
        stockId: stock.id,
        price: quote.price, changePercent: quote.changePercent,
        sma20: indicators.sma20, sma50: indicators.sma50, rsi14: indicators.rsi14,
        newsSummary: newsAnalysis.summary, newsSentiment: newsAnalysis.sentiment,
        analysisText: active.analysisText,
        scenarioLabel: active.scenarioLabel,
        scenarioJustification: active.scenarioJustification,
        divergenceAlert: active.divergenceAlert,
        horizonMatch: active.horizonMatch,
        keyMetrics: JSON.stringify(active.keyMetrics),
        metricsData: JSON.stringify(metricsData),
        allHorizons: JSON.stringify(allAI),
      });

      insertSnapshot({
        stockId: stock.id, price: quote.price, changePercent: quote.changePercent,
        scenarioLabel: active.scenarioLabel, horizonUsed: horizon, rsi14: indicators.rsi14,
      }).catch((e) => console.warn("[ORCHESTRATOR] History snapshot failed:", e));

      const dataIssues: DataIssue[] = newsAnalysis.dataIssue ? [newsAnalysis.dataIssue] : [];
      return { stock, analysis, dataIssues };
    })
  );

  persistResults.forEach((r, i) => {
    const { stock } = withMarket[i];
    if (r.status === "fulfilled") {
      const { analysis, dataIssues } = r.value;
      finalResults.push({ ticker: stock.ticker, stockId: stock.id, success: true, analysis, dataIssues });
    } else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.error(`[ORCHESTRATOR] Persist failed for ${stock.ticker}: ${msg}`);
      finalResults.push({ ticker: stock.ticker, stockId: stock.id, success: false, error: msg });
    }
  });

  return finalResults;
}

// ── Partial pipeline (price / technicals / news only — no Gemini per-stock) ───

async function runPartialAnalysis(
  stocks: StockInput[],
  types: UpdateType[]
): Promise<OrchestrationResult[]> {
  const results = await Promise.allSettled(
    stocks.map((stock) => runPartialForStock(stock, types))
  );
  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          ticker: stocks[i].ticker, stockId: stocks[i].id,
          success: false,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        }
  );
}

async function runPartialForStock(
  stock: StockInput,
  types: UpdateType[]
): Promise<OrchestrationResult> {
  const existing = await getAnalysisByStockId(stock.id);
  if (!existing) {
    return {
      ticker: stock.ticker, stockId: stock.id, success: false,
      error: "Sin análisis previo. Realiza primero una actualización completa (Análisis IA).",
    };
  }

  const needsPrice      = types.includes("price");
  const needsTechnicals = types.includes("technicals");
  const needsNews       = types.includes("news");

  // Fetch all needed data in parallel
  const [quoteResult, historicalResult, fundResult, newsResult] = await Promise.allSettled([
    needsPrice || needsTechnicals ? getCurrentQuote(stock.ticker) : Promise.resolve(null),
    needsTechnicals ? getHistoricalCloses(stock.ticker, 60) : Promise.resolve(null),
    needsTechnicals ? fetchAllFundamentals(stock.ticker) : Promise.resolve(null),
    needsNews ? analyzeNewsForTicker(stock.ticker) : Promise.resolve(null),
  ]);

  const patch: Record<string, unknown> = {};

  if (needsPrice && quoteResult.status === "fulfilled" && quoteResult.value) {
    patch.price        = quoteResult.value.price;
    patch.changePercent = quoteResult.value.changePercent;
  }

  if (needsTechnicals && historicalResult.status === "fulfilled" && historicalResult.value
      && fundResult.status === "fulfilled" && fundResult.value) {
    const historical     = historicalResult.value;
    const allFundamentals = fundResult.value;
    const indicators     = calculateIndicators(
      stock.ticker, historical.closes, historical.highs, historical.lows, historical.volumes
    );
    patch.sma20       = indicators.sma20;
    patch.sma50       = indicators.sma50;
    patch.rsi14       = indicators.rsi14;
    patch.metricsData = JSON.stringify(
      buildMetricsData(stock.investmentHorizon ?? "SHORT_TERM", indicators, allFundamentals)
    );
  }

  if (needsNews && newsResult.status === "fulfilled" && newsResult.value) {
    patch.newsSummary   = newsResult.value.summary;
    patch.newsSentiment = newsResult.value.sentiment;
  }

  if (Object.keys(patch).length === 0) {
    return { ticker: stock.ticker, stockId: stock.id, success: true, skipped: true, analysis: existing };
  }

  const updated = await patchAnalysisFields(stock.id, patch);
  return { ticker: stock.ticker, stockId: stock.id, success: true, analysis: updated ?? existing };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isFresh(analysis: StockAnalysisModel | null, force: boolean): boolean {
  if (force || !analysis) return false;
  return Date.now() - new Date(analysis.updatedAt).getTime() < CACHE_TTL_MS;
}

function horizonToAI(all: AllHorizonsAIAnalysis, horizon: InvestmentHorizon): HorizonAnalysis {
  if (horizon === "MEDIUM_TERM") return all.mediumTerm;
  if (horizon === "LONG_TERM")   return all.longTerm;
  return all.shortTerm;
}

function buildMetricsData(
  horizon: InvestmentHorizon,
  indicators: ReturnType<typeof calculateIndicators>,
  allFundamentals: AllFundamentals
): Record<string, unknown> {
  return {
    _horizon: horizon,
    short:  { atr14: indicators.atr14, relVolume: indicators.relVolume },
    medium: allFundamentals.medium,
    long:   allFundamentals.long,
  };
}
