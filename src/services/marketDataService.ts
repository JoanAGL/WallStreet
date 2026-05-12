import { fetchQuote } from "@/lib/finnhubClient";
import { fetchYahooCandles } from "@/lib/yahooFinanceClient";

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
  closes:     number[];
  highs:      number[];
  lows:       number[];
  volumes:    number[];
  dates:      string[];
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
  const candles = await fetchYahooCandles(ticker, days);

  // Invertimos para que índice 0 = más reciente
  const closes  = [...candles.closes].reverse().slice(0, days);
  const highs   = [...candles.highs].reverse().slice(0, days);
  const lows    = [...candles.lows].reverse().slice(0, days);
  const volumes = [...candles.volumes].reverse().slice(0, days);
  const dates   = [...candles.timestamps]
    .reverse()
    .slice(0, days)
    .map((t) => new Date(t * 1000).toISOString().slice(0, 10));

  return { ticker, closes, highs, lows, volumes, dates };
}
