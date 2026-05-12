import { getCurrentQuote, getHistoricalCloses } from "./marketDataService";
import { calculateIndicators } from "./technicalAnalysisService";
import { analyzeNewsForTicker } from "./newsAnalysisService";
import type { DataIssue } from "./newsAnalysisService";
import { generateStockAnalysis } from "./aiAnalysisService";
import { fetchAllFundamentals } from "@/lib/yahooFinanceClient";
import type { AllFundamentals, FundamentalMetrics } from "@/lib/yahooFinanceClient";
import { upsertAnalysis, getAnalysisByStockId } from "@/repositories/analysisRepository";
import type { StockAnalysisModel, InvestmentHorizon } from "@/types/models";

const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

export interface OrchestrationResult {
  ticker: string;
  stockId: string;
  success: boolean;
  skipped?: boolean;
  error?: string;
  analysis?: StockAnalysisModel;
  dataIssues?: DataIssue[];
}

function isFresh(analysis: StockAnalysisModel | null, force: boolean): boolean {
  if (force || !analysis) return false;
  return Date.now() - new Date(analysis.updatedAt).getTime() < CACHE_TTL_MS;
}

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
  stocks: { id: string; ticker: string; investmentHorizon?: InvestmentHorizon }[],
  forceUpdate = false
): Promise<OrchestrationResult[]> {
  if (stocks.length === 0) return [];

  // ── Fase 1: Freshness check (paralelo) ───────────────────────────────────
  const freshnessResults = await Promise.allSettled(
    stocks.map((s) => getAnalysisByStockId(s.id))
  );

  const staleStocks: typeof stocks = [];
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

  // ── Fase 2: Market data + fundamentals (paralelo, sin Gemini) ────────────
  type MarketData = {
    stock: typeof stocks[0];
    quote: Awaited<ReturnType<typeof getCurrentQuote>>;
    indicators: ReturnType<typeof calculateIndicators>;
    allFundamentals: AllFundamentals;
  };

  const marketResults = await Promise.allSettled(
    staleStocks.map(async (stock): Promise<MarketData> => {
      const [quote, historical, allFundamentals] = await Promise.all([
        getCurrentQuote(stock.ticker),
        getHistoricalCloses(stock.ticker, 60),
        fetchAllFundamentals(stock.ticker), // nunca lanza — devuelve nulls en caso de error
      ]);
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
      };
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

  // ── Fases 3+4+5: Gemini secuencial ───────────────────────────────────────
  for (const { stock, quote, indicators, allFundamentals } of withMarket) {
    const horizon: InvestmentHorizon = stock.investmentHorizon ?? "SHORT_TERM";
    let newsAnalysis: Awaited<ReturnType<typeof analyzeNewsForTicker>> | null = null;
    const dataIssues: DataIssue[] = [];

    // Fundamentals ya disponibles desde la fase paralela — seleccionar los del horizonte activo para Gemini
    const fundamentals: FundamentalMetrics | null =
      horizon === "MEDIUM_TERM" ? { horizon: "MEDIUM_TERM", ...allFundamentals.medium } :
      horizon === "LONG_TERM"   ? { horizon: "LONG_TERM",   ...allFundamentals.long }   :
      null;

    try {
      // Fase 3: News analysis (Gemini — no fatal)
      newsAnalysis = await analyzeNewsForTicker(stock.ticker);
      if (newsAnalysis.dataIssue) dataIssues.push(newsAnalysis.dataIssue);

      // Fase 4: AI stock analysis (Gemini — con horizonte y fundamentals)
      const aiAnalysis = await generateStockAnalysis(
        stock.ticker,
        quote.price,
        quote.changePercent,
        indicators,
        newsAnalysis,
        horizon,
        fundamentals
      );

      // Fase 5: Persist
      const metricsData = buildMetricsData(horizon, indicators, allFundamentals);

      const analysis = await upsertAnalysis({
        stockId:              stock.id,
        price:                quote.price,
        changePercent:        quote.changePercent,
        sma20:                indicators.sma20,
        sma50:                indicators.sma50,
        rsi14:                indicators.rsi14,
        newsSummary:          newsAnalysis.summary,
        newsSentiment:        newsAnalysis.sentiment,
        analysisText:         aiAnalysis.analysisText,
        scenarioLabel:        aiAnalysis.scenario.label,
        scenarioJustification: aiAnalysis.scenario.justification,
        divergenceAlert:      aiAnalysis.divergenceAlert,
        horizonMatch:         aiAnalysis.horizonMatch,
        keyMetrics:           JSON.stringify(aiAnalysis.keyMetrics),
        metricsData:          JSON.stringify(metricsData),
      });

      if (dataIssues.length) {
        dataIssues.forEach((issue) =>
          console.warn(`[ORCHESTRATOR] ${stock.ticker} - ${issue.kind} (${issue.source}): ${issue.message}`)
        );
      }

      finalResults.push({ ticker: stock.ticker, stockId: stock.id, success: true, analysis, dataIssues });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ORCHESTRATOR] ${stock.ticker} AI error: ${msg}`);

      // Persiste siempre los datos de mercado aunque Gemini falle
      try {
        const analysis = await upsertAnalysis({
          stockId:              stock.id,
          price:                quote.price,
          changePercent:        quote.changePercent,
          sma20:                indicators.sma20,
          sma50:                indicators.sma50,
          rsi14:                indicators.rsi14,
          newsSummary:          newsAnalysis?.summary ?? "Resumen de noticias no disponible.",
          newsSentiment:        newsAnalysis?.sentiment ?? "Neutral",
          analysisText:         "Análisis de IA temporalmente no disponible. Los datos de mercado han sido actualizados.",
          scenarioLabel:        "Neutral",
          scenarioJustification: "El análisis automático no está disponible en este momento.",
          divergenceAlert:      false,
          horizonMatch:         null,
          keyMetrics:           null,
          metricsData:          null,
        });
        dataIssues.push({ kind: "API_ERROR", source: "ai", message: msg });
        finalResults.push({ ticker: stock.ticker, stockId: stock.id, success: false, error: msg, analysis, dataIssues });
      } catch {
        finalResults.push({ ticker: stock.ticker, stockId: stock.id, success: false, error: msg, dataIssues });
      }
    }
  }

  return finalResults;
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
