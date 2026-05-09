import { getCurrentQuote, getHistoricalCloses } from "./marketDataService";
import { calculateIndicators } from "./technicalAnalysisService";
import { analyzeNewsForTicker } from "./newsAnalysisService";
import { generateStockAnalysis } from "./aiAnalysisService";
import { upsertAnalysis } from "@/repositories/analysisRepository";
import type { StockAnalysis } from "@prisma/client";

export interface OrchestrationResult {
  ticker: string;
  stockId: string;
  success: boolean;
  error?: string;
  analysis?: StockAnalysis;
}

/**
 * Ejecuta el pipeline completo de análisis para una acción:
 * datos de mercado → indicadores técnicos → noticias → IA → persistencia.
 */
export async function runAnalysisForStock(
  stockId: string,
  ticker: string
): Promise<OrchestrationResult> {
  try {
    // 1. Datos de mercado en paralelo
    const [quote, historical] = await Promise.all([
      getCurrentQuote(ticker),
      getHistoricalCloses(ticker, 60),
    ]);

    // 2. Indicadores técnicos (cálculo local, sin red)
    const indicators = calculateIndicators(ticker, historical.closes);

    // 3. Noticias + IA en paralelo
    const newsAnalysis = await analyzeNewsForTicker(ticker);
    const aiAnalysis = await generateStockAnalysis(
      ticker,
      quote.price,
      quote.changePercent,
      indicators,
      newsAnalysis
    );

    // 4. Persistir resultado
    const analysis = await upsertAnalysis({
      stockId,
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
    });

    return { ticker, stockId, success: true, analysis };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error(`[ORCHESTRATOR] ${ticker}:`, message);
    return { ticker, stockId, success: false, error: message };
  }
}

/**
 * Ejecuta el análisis para múltiples acciones secuencialmente
 * para respetar rate limits de las APIs externas.
 */
export async function runAnalysisForStocks(
  stocks: { id: string; ticker: string }[]
): Promise<OrchestrationResult[]> {
  const results: OrchestrationResult[] = [];

  for (const stock of stocks) {
    const result = await runAnalysisForStock(stock.id, stock.ticker);
    results.push(result);
  }

  return results;
}
