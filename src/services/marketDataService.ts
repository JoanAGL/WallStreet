import { fetchGlobalQuote, fetchDailySeries } from "@/lib/alphaVantageClient";

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
  const raw = await fetchGlobalQuote(ticker);
  const quote = raw["Global Quote"];

  if (!quote || !quote["05. price"]) {
    throw new Error(`No se encontraron datos para el ticker: ${ticker}`);
  }

  return {
    ticker: quote["01. symbol"],
    price: parseFloat(quote["05. price"]),
    previousClose: parseFloat(quote["08. previous close"]),
    change: parseFloat(quote["09. change"]),
    changePercent: parseFloat(quote["10. change percent"].replace("%", "")),
    fetchedAt: new Date().toISOString(),
  };
}

export async function getHistoricalCloses(
  ticker: string,
  days = 60
): Promise<HistoricalData> {
  const raw = await fetchDailySeries(ticker);
  const series = raw["Time Series (Daily)"];

  if (!series) {
    throw new Error(`No hay datos históricos para: ${ticker}`);
  }

  const sortedDates = Object.keys(series).sort((a, b) =>
    b.localeCompare(a)
  );

  const sliced = sortedDates.slice(0, days);
  const closes = sliced.map((date) => parseFloat(series[date]["4. close"]));

  return { ticker, closes, dates: sliced };
}
