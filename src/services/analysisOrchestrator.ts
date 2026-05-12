import { getCurrentQuote, getHistoricalCloses } from "./marketDataService";
import { calculateIndicators } from "./technicalAnalysisService";
import { analyzeNewsForTicker } from "./newsAnalysisService";
import type { DataIssue, NewsAnalysis } from "./newsAnalysisService";
import { generateStockAnalysis } from "./aiAnalysisService";
import type { AIStockAnalysis } from "./aiAnalysisService";
import { upsertAnalysis, getAnalysisByStockId } from "@/repositories/analysisRepository";
import type { StockAnalysisModel } from "@/types/models";

// TTL del caché: 4 horas
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

export interface OrchestrationResult {
  ticker: string;
  stockId: string;
  success: boolean;
  /** true = datos servidos desde caché, sin llamadas externas */
  skipped?: boolean;
  error?: string;
  analysis?: StockAnalysisModel;
  /** Problemas no fatales detectados (NO_DATA, API_ERROR) */
  dataIssues?: DataIssue[];
}

function isFresh(analysis: StockAnalysisModel | null, force: boolean): boolean {
  if (force || !analysis) return false;
  return Date.now() - new Date(analysis.updatedAt).getTime() < CACHE_TTL_MS;
}

/** Punto de entrada para un único ticker; delega en la versión batch. */
export async function runAnalysisForStock(
  stockId: string,
  ticker: string,
  forceUpdate = false
): Promise<OrchestrationResult> {
  const results = await runAnalysisForStocks([{ id: stockId, ticker }], forceUpdate);
  return results[0];
}

/**
 * Smart Refresh batch para N tickers.
 *
 * Fases:
 *  1. Freshness check (DB reads en paralelo) → split fresh/stale
 *  2. Market data para tickers stale (paralelo)
 *  3. News analysis — todas las llamadas Gemini en paralelo
 *  4. AI stock analysis — todas las llamadas Gemini en paralelo
 *  5. Persist — todos los upserts en paralelo
 *
 * Promise.allSettled en cada fase garantiza que el fallo de un ticker
 * no detiene el procesamiento de los demás.
 */
export async function runAnalysisForStocks(
  stocks: { id: string; ticker: string }[],
  forceUpdate = false
): Promise<OrchestrationResult[]> {
  if (stocks.length === 0) return [];

  // ── Fase 1: Freshness check ───────────────────────────────────────────────
  const freshnessResults = await Promise.allSettled(
    stocks.map((s) => getAnalysisByStockId(s.id))
  );

  const staleStocks: { id: string; ticker: string }[] = [];
  const finalResults: OrchestrationResult[] = [];

  stocks.forEach((stock, i) => {
    const cached =
      freshnessResults[i].status === "fulfilled"
        ? freshnessResults[i].value
        : null;

    if (isFresh(cached, forceUpdate)) {
      finalResults.push({
        ticker: stock.ticker,
        stockId: stock.id,
        success: true,
        skipped: true,
        analysis: cached!,
      });
    } else {
      staleStocks.push(stock);
    }
  });

  if (staleStocks.length === 0) return finalResults;

  console.log(
    `[ORCHESTRATOR] ${staleStocks.length} stale / ${finalResults.length} cached (force=${forceUpdate})`
  );

  // ── Fase 2: Market data (paralelo) ───────────────────────────────────────
  type MarketData = {
    stock: { id: string; ticker: string };
    quote: Awaited<ReturnType<typeof getCurrentQuote>>;
    indicators: ReturnType<typeof calculateIndicators>;
  };

  const marketResults = await Promise.allSettled(
    staleStocks.map(async (stock): Promise<MarketData> => {
      const [quote, historical] = await Promise.all([
        getCurrentQuote(stock.ticker),
        getHistoricalCloses(stock.ticker, 60),
      ]);
      return { stock, quote, indicators: calculateIndicators(stock.ticker, historical.closes) };
    })
  );

  const withMarket: MarketData[] = [];

  marketResults.forEach((r, i) => {
    if (r.status === "rejected") {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.error(`[ORCHESTRATOR] Market data API_ERROR for ${staleStocks[i].ticker}: ${msg}`);
      finalResults.push({
        ticker: staleStocks[i].ticker,
        stockId: staleStocks[i].id,
        success: false,
        error: msg,
        dataIssues: [{ kind: "API_ERROR", source: "market", message: msg }],
      });
    } else {
      withMarket.push(r.value);
    }
  });

  if (withMarket.length === 0) return finalResults;

  // ── Fase 3: News analysis — todas las llamadas Gemini en paralelo ─────────
  const newsResults = await Promise.allSettled(
    withMarket.map(({ stock }) => analyzeNewsForTicker(stock.ticker))
  );

  // ── Fase 4: AI stock analysis — todas las llamadas Gemini en paralelo ─────
  const aiResults = await Promise.allSettled(
    withMarket.map(({ stock, quote, indicators }, i): Promise<AIStockAnalysis> => {
      const newsRes = newsResults[i];
      const newsAnalysis: NewsAnalysis =
        newsRes.status === "fulfilled"
          ? newsRes.value
          : {
              ticker: stock.ticker,
              articles: [],
              summary: "Noticias no disponibles.",
              sentiment: "Neutral",
              analyzedAt: new Date().toISOString(),
            };

      return generateStockAnalysis(
        stock.ticker,
        quote.price,
        quote.changePercent,
        indicators,
        newsAnalysis
      );
    })
  );

  // ── Fase 5: Persist — todos los upserts en paralelo ──────────────────────
  const persistJobs = withMarket.map(
    async ({ stock, quote, indicators }, i): Promise<OrchestrationResult> => {
      const newsRes = newsResults[i];
      const aiRes = aiResults[i];

      // Recoger dataIssues no fatales
      const dataIssues: DataIssue[] = [];
      if (newsRes.status === "fulfilled" && newsRes.value.dataIssue) {
        dataIssues.push(newsRes.value.dataIssue);
      } else if (newsRes.status === "rejected") {
        const msg = newsRes.reason instanceof Error ? newsRes.reason.message : String(newsRes.reason);
        dataIssues.push({ kind: "API_ERROR", source: "news", message: msg });
      }

      if (aiRes.status === "rejected") {
        const msg = aiRes.reason instanceof Error ? aiRes.reason.message : String(aiRes.reason);
        dataIssues.push({ kind: "API_ERROR", source: "ai", message: msg });
        return { ticker: stock.ticker, stockId: stock.id, success: false, error: msg, dataIssues };
      }

      const aiAnalysis = aiRes.value;
      const newsSummary =
        newsRes.status === "fulfilled" ? newsRes.value.summary : "No disponible";
      const newsSentiment =
        newsRes.status === "fulfilled" ? newsRes.value.sentiment : "Neutral";

      try {
        const analysis = await upsertAnalysis({
          stockId: stock.id,
          price: quote.price,
          changePercent: quote.changePercent,
          sma20: indicators.sma20,
          sma50: indicators.sma50,
          rsi14: indicators.rsi14,
          newsSummary,
          newsSentiment,
          analysisText: aiAnalysis.analysisText,
          scenarioLabel: aiAnalysis.scenario.label,
          scenarioJustification: aiAnalysis.scenario.justification,
          divergenceAlert: aiAnalysis.divergenceAlert,
        });

        if (dataIssues.length) {
          dataIssues.forEach((issue) =>
            console.warn(`[ORCHESTRATOR] ${stock.ticker} - ${issue.kind} (${issue.source}): ${issue.message}`)
          );
        }

        return { ticker: stock.ticker, stockId: stock.id, success: true, analysis, dataIssues };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ticker: stock.ticker, stockId: stock.id, success: false, error: msg, dataIssues };
      }
    }
  );

  const persistResults = await Promise.allSettled(persistJobs);

  persistResults.forEach((r) => {
    if (r.status === "fulfilled") {
      finalResults.push(r.value);
    }
  });

  return finalResults;
}
