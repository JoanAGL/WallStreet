import { getCurrentQuote, getHistoricalCloses } from "./marketDataService";
import type { CurrentQuote, HistoricalData } from "./marketDataService";
import { detectAndRegisterSplits } from "./splitDetectionService";
import { withTimeout } from "@/lib/withTimeout";
import { calculateIndicators } from "./technicalAnalysisService";
import { analyzeNewsForTicker, fetchAllArticlesInParallel, batchAnalyzeSentiment } from "./newsAnalysisService";
import type { DataIssue, NewsAnalysis, Sentiment } from "./newsAnalysisService";
import { batchGenerateAllHorizons, FALLBACK_HORIZON } from "./aiAnalysisService";
import type { AllHorizonsAIAnalysis, HorizonAnalysis, BatchStockInput, DataQuality } from "./aiAnalysisService";
import { calculatePortfolioQuantMetrics, findTickerMetrics, calculateFearGreedScore, classifyRegimeSafe } from "./quantitativeService";
import { getGlobalContext } from "./macroService";
import type { MacroGlobalContext } from "./macroService";
import { fetchAllEarningsGuidance } from "./earningsService";
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
import { prisma } from "@/lib/prisma";
import { generatePortfolioAnalysis } from "@/services/portfolioAIService";
import type { StockAnalysisModel, InvestmentHorizon } from "@/types/models";
import type { UpdateType } from "@/types/updateTypes";

const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

// ── Per-service timeout budgets (ms) ─────────────────────────────────────────
// Vercel Pro budget (300s) for 20-stock worst case (batch size 4 → 5 Gemini calls):
//   market data parallel: max(quote 3s, historical 8s, fundamentals 6s) ≈ 8s
//   macro + news batch parallel:                                          ≈ 12s
//   sentiment + earnings parallel:                                        ≈ 10s
//   Gemini batch (5 calls × 25s each, sequential within batch engine):   ≈ 125s
//   portfolio AI:                                                         ≈ 30s
//   Total worst-case estimate: ~185s — well within the 300s Pro limit.
const TIMEOUTS = {
  quote:           10_000,   // aumentado de 3s → 10s (Finnhub + Yahoo fallback para acciones europeas)
  historical:       8_000,   // Yahoo Finance candlestick data
  fundamentals:     6_000,   // Yahoo Finance quoteSummary
  macro:           12_000,   // MacroService (NewsAPI + Gemini classify, 4h cache)
  newsBatch:       10_000,   // NewsAPI articles — entire batch of tickers
  earningsBatch:    8_000,   // EarningsService — entire batch of tickers (30d cache)
  geminiPerStock:  25_000,   // Gemini per-stock (used to scale batch budget)
  geminiPortfolio: 30_000,   // Gemini portfolio analysis
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
    priceUSD:      0,
    currency:      "USD",
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
  // Último precio válido conocido por stock: si hoy fallan todas las fuentes
  // de cotización, es mejor conservar el precio de ayer (marcado degraded)
  // que machacarlo con 0 y mostrar la posición como pérdida total.
  const prevQuoteMap = new Map<string, { price: number; priceUSD: number | null; currency: string }>();

  stocks.forEach((stock, i) => {
    const cached = freshnessResults[i].status === "fulfilled" ? freshnessResults[i].value : null;
    if (cached && cached.price > 0) {
      prevQuoteMap.set(stock.id, { price: cached.price, priceUSD: cached.priceUSD, currency: cached.currency });
    }
    if (isFresh(cached, forceUpdate)) {
      finalResults.push({ ticker: stock.ticker, stockId: stock.id, success: true, skipped: true, analysis: cached! });
    } else {
      staleStocks.push(stock);
    }
  });

  if (staleStocks.length === 0) return finalResults;
  console.log(`[ORCHESTRATOR] ${staleStocks.length} stale / ${finalResults.length} cached (force=${forceUpdate})`);

  // Phase 1.5: detección automática de splits corporativos (Yahoo, caché 24h
  // por ticker). Registra transacciones SPLIT pendientes antes de calcular
  // métricas para que el WAC ya refleje el ajuste. Nunca bloquea el pipeline.
  // El precio USD del análisis previo sirve como referencia de corroboración.
  try {
    await detectAndRegisterSplits(staleStocks.map((s) => ({
      id: s.id,
      ticker: s.ticker,
      currentPriceUSD: prevQuoteMap.get(s.id)?.priceUSD ?? null,
    })));
  } catch (err) {
    console.warn("[ORCHESTRATOR] Detección de splits falló (continuando):", err);
  }

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

      const prev = prevQuoteMap.get(stock.id);
      const quote: CurrentQuote = quoteResult.status === "fulfilled"
        ? quoteResult.value
        : prev
          ? {
              ticker:        stock.ticker,
              price:         prev.price,
              priceUSD:      prev.priceUSD ?? prev.price,
              currency:      prev.currency ?? "USD",
              previousClose: prev.price,
              change:        0,
              changePercent: 0,
              fetchedAt:     new Date().toISOString(),
            }
          : DEFAULT_FALLBACKS.quote(stock.ticker);
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

  // Phase 2c + 3a: Macro context and article fetches in parallel (independent of each other)
  const tickers = withMarket.map(({ stock }) => stock.ticker);
  const [macroResult, rawArticlesResult] = await Promise.allSettled([
    withTimeout(getGlobalContext(),                  TIMEOUTS.macro,     "MacroService"),
    withTimeout(fetchAllArticlesInParallel(tickers), TIMEOUTS.newsBatch, "NewsAPI-batch"),
  ]);

  let macroContext: MacroGlobalContext | null = null;
  if (macroResult.status === "fulfilled") {
    macroContext = macroResult.value;
  } else {
    console.warn("[ORCHESTRATOR] MacroService failed, continuing without macro context:", macroResult.reason);
  }

  const batchTimeoutMsg = rawArticlesResult.status === "rejected"
    ? (rawArticlesResult.reason instanceof Error ? rawArticlesResult.reason.message : String(rawArticlesResult.reason))
    : null;
  if (batchTimeoutMsg) {
    console.warn("[ORCHESTRATOR] NewsAPI batch failed, using empty articles:", batchTimeoutMsg);
  }
  const articlesData = rawArticlesResult.status === "fulfilled"
    ? rawArticlesResult.value
    : tickers.map((): { articles: never[]; dataIssue: DataIssue } => ({
        articles: [],
        dataIssue: { kind: "API_ERROR", source: "news", message: batchTimeoutMsg ?? "NewsAPI-batch timeout" },
      }));

  // Phase 3b: Batch sentiment (depends on articles) + earnings in parallel
  // batchAnalyzeSentiment is not wrapped with withTimeout because it already
  // has internal fallback handling; wrapping would cut off its fallback path.
  const rawArticles = tickers
    .map((ticker, i) => ({ ticker, articles: articlesData[i].articles }))
    .filter((inp) => inp.articles.length > 0);

  const [batchSentimentsResult, earningsResult] = await Promise.allSettled([
    batchAnalyzeSentiment(rawArticles),
    withTimeout(fetchAllEarningsGuidance(tickers), TIMEOUTS.earningsBatch, "EarningsService"),
  ]);

  const batchSentiments = batchSentimentsResult.status === "fulfilled"
    ? batchSentimentsResult.value
    : new Map<string, { summary: string; sentiment: Sentiment }>();
  if (batchSentimentsResult.status === "rejected") {
    console.warn("[ORCHESTRATOR] batchAnalyzeSentiment failed:", batchSentimentsResult.reason);
  }

  const earningsData = earningsResult.status === "fulfilled"
    ? earningsResult.value
    : tickers.map(() => null);
  if (earningsResult.status === "rejected") {
    console.warn("[ORCHESTRATOR] EarningsService batch failed:", earningsResult.reason);
  }

  // Phase 4: Build newsAnalysisMap from articles + batch sentiment results
  const newsAnalysisMap = new Map<string, NewsAnalysis>();
  const now = new Date().toISOString();

  withMarket.forEach(({ stock }, i) => {
    const { articles, dataIssue } = articlesData[i];
    const sentimentEntry = batchSentiments.get(stock.ticker);
    newsAnalysisMap.set(stock.ticker, {
      ticker:     stock.ticker,
      articles,
      summary:    sentimentEntry?.summary   ?? (articles.length > 0 ? "Pendiente de análisis." : "Error al obtener noticias."),
      sentiment:  sentimentEntry?.sentiment ?? "Neutral",
      analyzedAt: now,
      dataIssue,
    });
  });

  // Phase 5: Build batch inputs and run batch all-horizons AI (ceil(N/4) Gemini calls)
  const batchInputs: BatchStockInput[] = withMarket.map(({ stock, quote, indicators, allFundamentals, dataQuality }, i) => {
    const quantMetrics = findTickerMetrics(allQuantMetrics, stock.ticker);
    const newsAnalysis = newsAnalysisMap.get(stock.ticker)!;
    const sentiment = newsAnalysis.sentiment as "Positivo" | "Neutral" | "Negativo";
    const fearGreedScore = indicators.rsi14 != null
      ? calculateFearGreedScore(indicators.rsi14, sentiment)
      : null;
    const earningsGuidance = earningsData[i] ?? null;

    // Régimen de mercado combinado (issue #49): Hurst + RSI + volumen + GARCH
    const marketRegime = classifyRegimeSafe(
      indicators.hurstExponent,
      indicators.rsi14,
      indicators.relVolume,
      quantMetrics?.volatility30d ?? null
    );

    // Finalise dataQuality.news: true when articles were actually fetched for this ticker
    const newsOk = rawArticlesResult.status === "fulfilled" && articlesData[i].articles.length > 0;
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
      marketRegime,
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
    withMarket.map(async ({ stock, quote, indicators, allFundamentals }, i) => {
      const horizon: InvestmentHorizon = stock.investmentHorizon ?? "SHORT_TERM";
      const newsAnalysis = newsAnalysisMap.get(stock.ticker)!;
      const allAI = allHorizonsMap.get(stock.ticker) ?? {
        shortTerm: FALLBACK_HORIZON, mediumTerm: FALLBACK_HORIZON, longTerm: FALLBACK_HORIZON,
      };
      const active = horizonToAI(allAI, horizon);
      const metricsData = buildMetricsData(horizon, indicators, allFundamentals);

      const [analysis] = await Promise.all([
        upsertAnalysis({
          stockId: stock.id,
          price: quote.price, priceUSD: quote.priceUSD, currency: quote.currency,
          changePercent: quote.changePercent,
          sma20: indicators.sma20, sma50: indicators.sma50, rsi14: indicators.rsi14,
          marketRegime: batchInputs[i]?.marketRegime ?? null,
          newsSummary: newsAnalysis.summary, newsSentiment: newsAnalysis.sentiment,
          analysisText: active.analysisText,
          scenarioLabel: active.scenarioLabel,
          scenarioJustification: active.scenarioJustification,
          divergenceAlert: indicators.priceRsiDivergence ?? null,
          horizonMatch: active.horizonMatch,
          keyMetrics: JSON.stringify(active.keyMetrics),
          metricsData: JSON.stringify(metricsData),
          allHorizons: JSON.stringify(allAI),
        }),
        prisma.stock.update({
          where: { id: stock.id },
          data:  { currency: quote.currency },
        }),
      ]);

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
    const q = quoteResult.value;
    patch.price         = q.price;
    patch.priceUSD      = q.priceUSD;
    patch.currency      = q.currency;
    patch.changePercent = q.changePercent;
    prisma.stock.update({ where: { id: stock.id }, data: { currency: q.currency } }).catch(() => {/* non-critical */});
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
  if (analysis.price === 0 || analysis.price == null) return false;
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
