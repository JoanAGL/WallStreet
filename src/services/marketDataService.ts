import { fetchQuote } from "@/lib/finnhubClient";
import { fetchYahooCandles, fetchEURUSD } from "@/lib/yahooFinanceClient";

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
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d&includePrePost=false`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept":          "application/json",
        "Accept-Language": "en-US,en;q=0.9",
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;

    const data = await res.json() as {
      chart: {
        result: [{
          meta: { currency: string; regularMarketPrice: number; previousClose: number; chartPreviousClose: number };
          indicators: { quote: [{ close: (number | null)[] }] };
        }] | null;
        error: unknown;
      };
    };

    if (data.chart.error || !data.chart.result?.[0]) return null;

    const result   = data.chart.result[0];
    const meta     = result.meta;
    const currency = meta.currency ?? "USD";

    const closes    = result.indicators.quote[0]?.close ?? [];
    const lastClose = [...closes].reverse().find((c) => c != null && c > 0);
    const price     = meta.regularMarketPrice > 0 ? meta.regularMarketPrice : (lastClose ?? 0);
    const prevClose = meta.previousClose > 0 ? meta.previousClose : (meta.chartPreviousClose ?? price);

    if (!price || price <= 0) return null;

    const change        = Math.round((price - prevClose) * 10000) / 10000;
    const changePercent = prevClose > 0
      ? Math.round(((price - prevClose) / prevClose) * 10000) / 100
      : 0;

    let priceUSD = price;
    if (currency !== "USD") {
      const fxRate = await fetchEURUSD().catch(() => 1.10);
      priceUSD = Math.round(price * fxRate * 10000) / 10000;
    }

    return { ticker, price, priceUSD, currency, previousClose: prevClose, change, changePercent, fetchedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}

export async function getCurrentQuote(ticker: string): Promise<CurrentQuote> {
  // Finnhub no cubre acciones europeas: según el día devuelve c:0 (200 OK) o
  // directamente 403/429 (excepción). Cualquiera de los dos casos debe caer
  // al fallback de Yahoo — si solo se comprueba c<=0, una excepción de
  // Finnhub se propaga y el fallback nunca llega a ejecutarse (SAB.MC y
  // NOVO-B.CO quedaban con precio 0 permanente).
  let quote: Awaited<ReturnType<typeof fetchQuote>> | null = null;
  try {
    quote = await fetchQuote(ticker);
  } catch (err) {
    console.warn(`[getCurrentQuote] Finnhub failed for ${ticker}, trying Yahoo:`, err);
  }

  if (!quote || !quote.c || quote.c <= 0) {
    const yahooQuote = await getQuoteFromYahoo(ticker);
    if (yahooQuote) {
      console.log(`[getCurrentQuote] Yahoo OK for ${ticker}: ${yahooQuote.price} ${yahooQuote.currency}`);
      return yahooQuote;
    }
    throw new Error(`Sin datos de precio para: ${ticker}`);
  }

  // Ticker americano con precio Finnhub válido — siempre USD
  return {
    ticker,
    price:         quote.c,
    priceUSD:      quote.c,
    currency:      "USD",
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
