import { getCurrentQuote, getHistoricalCloses } from "./marketDataService";
import { calculateIndicators } from "./technicalAnalysisService";
import { analyzeNewsForTicker } from "./newsAnalysisService";
import type { DataIssue } from "./newsAnalysisService";
import { generateStockAnalysis } from "./aiAnalysisService";
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
 *  2. Market data para tickers stale (paralelo — no Gemini)
 *  3. Por cada stock stale con market data (SECUENCIAL):
 *       news Gemini → AI Gemini → upsert
 *     El fallo de un ticker no detiene a los demás (try/catch por stock).
 *
 * Las fases de Gemini son secuenciales para respetar el rate-limit del
 * tier gratuito (20 RPM). Si se recibe un 429, geminiClient espera el
 * tiempo exacto que Gemini indica en su cuerpo de error ("retry in Xs").
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

  // ── Fases 3+4+5: Gemini secuencial por stock ─────────────────────────────
  // Procesar un stock a la vez para no saturar el rate-limit de Gemini.
  // El fallo de un ticker queda aislado y no interrumpe a los siguientes.
  for (const { stock, quote, indicators } of withMarket) {
    try {
      const dataIssues: DataIssue[] = [];

      // Fase 3: News analysis (Gemini)
      const newsAnalysis = await analyzeNewsForTicker(stock.ticker);
      if (newsAnalysis.dataIssue) dataIssues.push(newsAnalysis.dataIssue);

      // Fase 4: AI stock analysis (Gemini)
      const aiAnalysis = await generateStockAnalysis(
        stock.ticker,
        quote.price,
        quote.changePercent,
        indicators,
        newsAnalysis
      );

      // Fase 5: Persist
      const analysis = await upsertAnalysis({
        stockId: stock.id,
        price: quote.price,
        changePercent: quote.changePercent,
        sma20: indicators.sma20,
        sma50: indicators.sma50,
        rsi14: indicators.rsi14,
        newsSummary: newsAnalysis.summary,
        newsSentiment: newsAnalysis.sentiment,
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

      finalResults.push({ ticker: stock.ticker, stockId: stock.id, success: true, analysis, dataIssues });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ORCHESTRATOR] ${stock.ticker}:`, msg);
      finalResults.push({ ticker: stock.ticker, stockId: stock.id, success: false, error: msg });
    }
  }

  return finalResults;
}
