/**
 * Integration tests for the analysis pipeline.
 *
 * These tests verify the full analysis contract without hitting real external
 * APIs. Every external dependency is mocked at module level so the tests run
 * offline, deterministically, and fast (<2s).
 *
 * Why here and not in src/__tests__/:
 *   - These tests exercise the interaction between multiple services
 *     (orchestrator → AI service → quant service → news service).
 *   - They exist specifically to catch regressions when refactoring the
 *     orchestrator (e.g. Batch Gemini migration) that pure unit tests miss.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MOCK_TICKER,
  MOCK_PRICE,
  MOCK_CHANGE_PCT,
  MOCK_HISTORICAL_CLOSES,
  MOCK_NEWS_ARTICLES,
  MOCK_ALL_HORIZONS_RESPONSE,
  MOCK_NEWS_ANALYSIS_RESPONSE,
  MOCK_STOCK,
} from "../fixtures/mockData";

// ── Module mocks (must be hoisted before imports) ─────────────────────────────

vi.mock("@/lib/geminiClient", () => ({
  geminiChat: vi.fn(),
  STATIC_SYSTEM_INSTRUCTION: "mocked-static-system-instruction",
}));

vi.mock("@/services/marketDataService", () => ({
  getCurrentQuote: vi.fn(),
  getHistoricalCloses: vi.fn(),
}));

vi.mock("@/lib/newsApiClient", () => ({
  fetchNewsForTicker: vi.fn(),
}));

vi.mock("@/services/newsAnalysisService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/newsAnalysisService")>();
  return {
    ...actual,
    fetchAllArticlesInParallel: vi.fn(), // batch entry-point used by full pipeline
    batchAnalyzeSentiment: vi.fn(),
    analyzeNewsForTicker: vi.fn(),       // kept for partial-update path
  };
});

vi.mock("@/lib/yahooFinanceClient", () => ({
  fetchAllFundamentals: vi.fn(),
}));

vi.mock("@/repositories/analysisRepository", () => ({
  upsertAnalysis: vi.fn(),
  patchAnalysisFields: vi.fn(),
  getAnalysisByStockId: vi.fn(),
}));

vi.mock("@/repositories/analysisHistoryRepository", () => ({
  insertSnapshot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/macroService", () => ({
  getGlobalContext: vi.fn(),
}));

vi.mock("@/services/earningsService", () => ({
  fetchAllEarningsGuidance: vi.fn(), // batch entry-point replacing EarningsService.getGuidanceInsight × N
}));

vi.mock("@/lib/cacheStore", () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { geminiChat } from "@/lib/geminiClient";
import { getCurrentQuote, getHistoricalCloses } from "@/services/marketDataService";
import { fetchNewsForTicker } from "@/lib/newsApiClient";
import { fetchAllFundamentals } from "@/lib/yahooFinanceClient";
import { upsertAnalysis, getAnalysisByStockId } from "@/repositories/analysisRepository";
import { getGlobalContext } from "@/services/macroService";
import { fetchAllEarningsGuidance } from "@/services/earningsService";
import { fetchAllArticlesInParallel, batchAnalyzeSentiment } from "@/services/newsAnalysisService";
import { runAnalysisForStocks } from "@/services/analysisOrchestrator";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockFundamentals() {
  return {
    medium: {
      horizon: "MEDIUM_TERM" as const,
      revenueGrowthYoY: 0.061,
      forwardEps: 7.2,
      pegRatio: 2.1,
      debtToEquity: 1.8,
      returnOnEquity: 0.31,
    },
    long: {
      horizon: "LONG_TERM" as const,
      trailingPE: 28.5,
      dividendYield: 0.006,
      profitMargin: 0.245,
      freeCashflowYield: 0.042,
      beta: 1.2,
    },
  };
}

function setupMocks() {
  vi.mocked(getCurrentQuote).mockResolvedValue({
    ticker: MOCK_TICKER,
    price: MOCK_PRICE,
    previousClose: MOCK_PRICE / (1 + MOCK_CHANGE_PCT / 100),
    change: MOCK_PRICE * MOCK_CHANGE_PCT / 100,
    changePercent: MOCK_CHANGE_PCT,
    fetchedAt: new Date().toISOString(),
  });

  vi.mocked(getHistoricalCloses).mockResolvedValue({
    ticker: MOCK_TICKER,
    closes: MOCK_HISTORICAL_CLOSES,
    highs:   MOCK_HISTORICAL_CLOSES.map((p) => p * 1.01),
    lows:    MOCK_HISTORICAL_CLOSES.map((p) => p * 0.99),
    volumes: MOCK_HISTORICAL_CLOSES.map(() => 50_000_000),
    dates:   MOCK_HISTORICAL_CLOSES.map((_, i) =>
      new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
    ),
  });

  vi.mocked(fetchNewsForTicker).mockResolvedValue(MOCK_NEWS_ARTICLES);

  // fetchAllArticlesInParallel: returns one result per ticker (1 ticker in tests)
  vi.mocked(fetchAllArticlesInParallel).mockResolvedValue([
    {
      articles: MOCK_NEWS_ARTICLES.map((a) => ({
        title: a.title,
        description: a.description ?? "",
        url: a.url,
        publishedAt: a.publishedAt,
        source: a.source.name,
      })),
    },
  ]);

  // batchAnalyzeSentiment: returns pre-computed sentiment map
  vi.mocked(batchAnalyzeSentiment).mockResolvedValue(
    new Map([[MOCK_TICKER, { summary: "Resultados sólidos.", sentiment: "Positivo" as const }]])
  );

  vi.mocked(fetchAllFundamentals).mockResolvedValue(makeMockFundamentals());

  vi.mocked(getGlobalContext).mockResolvedValue({
    items: [],
    fetchedAt: new Date().toISOString(),
  });

  // fetchAllEarningsGuidance: returns one result per ticker (1 ticker in tests)
  vi.mocked(fetchAllEarningsGuidance).mockResolvedValue([
    {
      fiscalQuarter: "Q2 2025",
      sentiment: "EXPANSIVO",
      revenueGuidanceYoY: 6.1,
      epsGuidanceStatus: "UPWARD",
      keyCeoQuotes: ["We remain confident in our long-term trajectory."],
      macroImpactJustification: "Rising rates create headwinds but product cycle offsets them.",
    },
  ]);

  // Only 1 Gemini call now: batch all-horizons.
  // News sentiment is mocked via batchAnalyzeSentiment (bypasses Gemini in tests).
  vi.mocked(geminiChat).mockResolvedValue(
    JSON.stringify({ [MOCK_TICKER]: MOCK_ALL_HORIZONS_RESPONSE })
  );

  vi.mocked(getAnalysisByStockId).mockResolvedValue(null); // force fresh analysis

  vi.mocked(upsertAnalysis).mockResolvedValue({
    id: "analysis-id-001",
    stockId: MOCK_STOCK.id,
    price: MOCK_PRICE,
    changePercent: MOCK_CHANGE_PCT,
    sma20: 183.1,
    sma50: 178.5,
    rsi14: 55.2,
    newsSummary: "Positive earnings beat analyst expectations.",
    newsSentiment: "Positivo",
    analysisText: MOCK_ALL_HORIZONS_RESPONSE.shortTerm.analysisText,
    scenarioLabel: "Positivo",
    scenarioJustification: MOCK_ALL_HORIZONS_RESPONSE.shortTerm.scenarioJustification,
    divergenceAlert: false,
    horizonMatch: MOCK_ALL_HORIZONS_RESPONSE.shortTerm.horizonMatch,
    keyMetrics: JSON.stringify(MOCK_ALL_HORIZONS_RESPONSE.shortTerm.keyMetrics),
    metricsData: null,
    allHorizons: JSON.stringify(MOCK_ALL_HORIZONS_RESPONSE),
    generatedAt: new Date(),
    updatedAt: new Date(),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runAnalysisForStocks — pipeline integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it("returns success result with analysis for a single stock", async () => {
    const results = await runAnalysisForStocks(
      [{ id: MOCK_STOCK.id, ticker: MOCK_TICKER, investmentHorizon: "SHORT_TERM" }],
      true  // forceUpdate
    );

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].ticker).toBe(MOCK_TICKER);
    expect(results[0].analysis).toBeDefined();
  });

  it("analysis contains all required contract fields", async () => {
    const [result] = await runAnalysisForStocks(
      [{ id: MOCK_STOCK.id, ticker: MOCK_TICKER, investmentHorizon: "SHORT_TERM" }],
      true
    );

    const analysis = result.analysis!;
    expect(analysis.price).toBe(MOCK_PRICE);
    expect(analysis.changePercent).toBe(MOCK_CHANGE_PCT);
    expect(analysis.newsSentiment).toMatch(/^(Positivo|Neutral|Negativo)$/);
    expect(analysis.scenarioLabel).toMatch(/^(Positivo|Neutral|Negativo)$/);
    expect(typeof analysis.divergenceAlert).toBe("boolean");
  });

  it("allHorizons JSON parses to valid AllHorizonsAIAnalysis shape", async () => {
    const [result] = await runAnalysisForStocks(
      [{ id: MOCK_STOCK.id, ticker: MOCK_TICKER, investmentHorizon: "SHORT_TERM" }],
      true
    );

    const raw = result.analysis?.allHorizons;
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!) as Record<string, unknown>;

    // All three horizon keys must be present
    expect(parsed).toHaveProperty("shortTerm");
    expect(parsed).toHaveProperty("mediumTerm");
    expect(parsed).toHaveProperty("longTerm");

    // Each horizon must have prescriptiveAction
    const horizons = ["shortTerm", "mediumTerm", "longTerm"] as const;
    horizons.forEach((h) => {
      const horizon = parsed[h] as Record<string, unknown>;
      expect(horizon).toHaveProperty("prescriptiveAction");
      const pa = horizon.prescriptiveAction as Record<string, unknown>;
      expect(["COMPRA", "VENTA", "MANTENER", "REDUCIR"]).toContain(pa.action);
      expect(typeof pa.confidenceScore).toBe("number");
      expect(pa.confidenceScore as number).toBeGreaterThanOrEqual(0);
      expect(pa.confidenceScore as number).toBeLessThanOrEqual(100);
    });
  });

  it("batch pipeline: Gemini called exactly ONCE for 1 stock (1 batch AI call)", async () => {
    await runAnalysisForStocks(
      [{ id: MOCK_STOCK.id, ticker: MOCK_TICKER, investmentHorizon: "SHORT_TERM" }],
      true
    );
    // News sentiment is handled by batchAnalyzeSentiment (mocked — no Gemini in test).
    // Only the batch all-horizons call goes through geminiChat.
    // Previous: 2 calls/stock × N stocks. Now: 1 batch call regardless of N ≤ BATCH_SIZE.
    expect(vi.mocked(geminiChat)).toHaveBeenCalledTimes(1);
  });

  it("handles Gemini failure gracefully — persists fallback analysis, no throw", async () => {
    // Reject all Gemini calls: both batchGenerateAllHorizons and its individual fallback
    vi.mocked(geminiChat).mockReset().mockRejectedValue(new Error("Gemini rate limit"));

    const results = await runAnalysisForStocks(
      [{ id: MOCK_STOCK.id, ticker: MOCK_TICKER, investmentHorizon: "SHORT_TERM" }],
      true
    );

    // New batch pipeline: Gemini failure → FALLBACK_ALL used; persist still runs.
    // success=true because upsertAnalysis succeeds with fallback data.
    // The analysis is stored with scenarioLabel="Neutral" and no allHorizons.
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(upsertAnalysis).toHaveBeenCalled();
  });

  it("handles quote failure gracefully — falls back to price:0, Gemini runs with degraded data", async () => {
    // Only the quote fails; historical + fundamentals are still mocked to succeed.
    // The new pipeline uses DEFAULT_FALLBACKS.quote instead of hard-failing the stock.
    vi.mocked(getCurrentQuote).mockRejectedValue(new Error("Finnhub timeout"));

    const results = await runAnalysisForStocks(
      [{ id: MOCK_STOCK.id, ticker: MOCK_TICKER, investmentHorizon: "SHORT_TERM" }],
      true
    );

    expect(results[0].success).toBe(true);
    expect(results[0].analysis).toBeDefined();
    expect(upsertAnalysis).toHaveBeenCalled();
    // Gemini still runs because historical + fundamentals succeeded
    expect(vi.mocked(geminiChat)).toHaveBeenCalled();
  });

  it("uses cached analysis when fresh (forceUpdate=false)", async () => {
    // Return a fresh cached analysis
    vi.mocked(getAnalysisByStockId).mockResolvedValue({
      id: "cached-id",
      stockId: MOCK_STOCK.id,
      price: MOCK_PRICE,
      changePercent: MOCK_CHANGE_PCT,
      sma20: null, sma50: null, rsi14: null,
      newsSummary: "cached",
      newsSentiment: "Neutral",
      analysisText: "cached",
      scenarioLabel: "Neutral",
      scenarioJustification: "cached",
      divergenceAlert: false,
      horizonMatch: null, keyMetrics: null, metricsData: null, allHorizons: null,
      generatedAt: new Date(),
      updatedAt: new Date(), // just updated → fresh
    });

    const results = await runAnalysisForStocks(
      [{ id: MOCK_STOCK.id, ticker: MOCK_TICKER, investmentHorizon: "SHORT_TERM" }],
      false  // do NOT force update
    );

    expect(results[0].skipped).toBe(true);
    expect(vi.mocked(geminiChat)).not.toHaveBeenCalled();
    expect(vi.mocked(getCurrentQuote)).not.toHaveBeenCalled();
  });
});
