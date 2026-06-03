import { fetchQuote } from "@/lib/finnhubClient";
import { fetchYahooCandles, fetchTickerCurrency, fetchEURUSD } from "@/lib/yahooFinanceClient";

export interface CurrentQuote {
  ticker:        string;
  price:         number;
  priceUSD:      number;
  currency:      string;
  previousClose: number;
  change:        number;
  changePercent: number;
  fetchedAt:     string;
}

export interface HistoricalData {
  ticker: string;
  closes:     number[];
  highs:      number[];
  lows:       number[];
  volumes:    number[];
  dates:      string[];
}

async function getQuoteFromYahoo(ticker: string): Promise<CurrentQuote | null> {
  try {
    const [candles, currency] = await Promise.all([
      fetchYahooCandles(ticker, 5),
      fetchTickerCurrency(ticker),
    ]);
    if (!candles.closes.length) return null;

    const price     = candles.closes[candles.closes.length - 1];
    const prevClose = candles.closes.length > 1
      ? candles.closes[candles.closes.length - 2]
      : price;

    if (!price || price <= 0) return null;

    const change        = Math.round((price - prevClose) * 10000) / 10000;
    const changePercent = prevClose > 0
      ? Math.round(((price - prevClose) / prevClose) * 10000) / 100
      : 0;

    let priceUSD = price;
    if (currency !== "USD") {
      const fxRate = await fetchEURUSD();
      priceUSD = Math.round(price * fxRate * 10000) / 10000;
    }

    return { ticker, price, priceUSD, currency, previousClose: prevClose, change, changePercent, fetchedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}

export async function getCurrentQuote(ticker: string): Promise<CurrentQuote> {
  const [quote, currency] = await Promise.all([
    fetchQuote(ticker),
    fetchTickerCurrency(ticker),
  ]);

  // Finnhub cubre NYSE/NASDAQ. Para acciones europeas (SAB.MC, NOVO-B.CO, etc.)
  // devuelve c:0 — en ese caso usar Yahoo Finance como fallback.
  if (!quote.c || quote.c <= 0) {
    const yahooQuote = await getQuoteFromYahoo(ticker);
    if (yahooQuote) return yahooQuote;
    throw new Error(`No se encontraron datos de precio para: ${ticker}`);
  }

  let priceUSD = quote.c;
  if (currency !== "USD") {
    const fxRate = await fetchEURUSD();
    priceUSD = Math.round(quote.c * fxRate * 10000) / 10000;
  }

  return {
    ticker,
    price:         quote.c,
    priceUSD,
    currency,
    previousClose: quote.pc,
    change:        quote.d,
    changePercent: quote.dp,
    fetchedAt:     new Date().toISOString(),
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
