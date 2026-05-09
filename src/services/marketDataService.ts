import { fetchQuote, fetchDailyCandles } from "@/lib/finnhubClient";

export interface CurrentQuote {
  ticker: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  fetchedAt: string;
}

export interface HistoricalData {
  ticker: string;
  /** Precios de cierre diarios, del más reciente al más antiguo */
  closes: number[];
  dates: string[];
}

export async function getCurrentQuote(ticker: string): Promise<CurrentQuote> {
  const quote = await fetchQuote(ticker);

  if (!quote.c) {
    throw new Error(`No se encontraron datos para el ticker: ${ticker}`);
  }

  return {
    ticker,
    price: quote.c,
    previousClose: quote.pc,
    change: quote.d,
    changePercent: quote.dp,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getHistoricalCloses(
  ticker: string,
  days = 60
): Promise<HistoricalData> {
  const candles = await fetchDailyCandles(ticker, days);

  // Invertimos para que el índice 0 sea el más reciente (requerido por TechnicalAnalysisService)
  const closes = [...candles.c].reverse().slice(0, days);
  const dates = [...candles.t]
    .reverse()
    .slice(0, days)
    .map((t) => new Date(t * 1000).toISOString().slice(0, 10));

  return { ticker, closes, dates };
}
