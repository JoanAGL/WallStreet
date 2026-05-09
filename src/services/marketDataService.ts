import { fetchLatestBar, fetchDailyBars } from "@/lib/alpacaClient";

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
  // Obtenemos las 2 últimas barras para calcular la variación diaria
  const bars = await fetchDailyBars(ticker, 2);

  if (bars.length === 0) {
    throw new Error(`No se encontraron datos para el ticker: ${ticker}`);
  }

  // Las barras vienen en orden ascendente (más antigua primero)
  const latest = bars[bars.length - 1];
  const previous = bars.length >= 2 ? bars[bars.length - 2] : null;

  const price = latest.c;
  const previousClose = previous ? previous.c : latest.o;
  const change = price - previousClose;
  const changePercent = previousClose !== 0
    ? (change / previousClose) * 100
    : 0;

  return {
    ticker,
    price,
    previousClose,
    change,
    changePercent,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getHistoricalCloses(
  ticker: string,
  days = 60
): Promise<HistoricalData> {
  const bars = await fetchDailyBars(ticker, days);

  if (bars.length === 0) {
    throw new Error(`No hay datos históricos para: ${ticker}`);
  }

  // Invertimos para que el índice 0 sea el más reciente (requerido por TechnicalAnalysisService)
  const reversed = [...bars].reverse();
  const closes = reversed.map((b) => b.c);
  const dates = reversed.map((b) => b.t.slice(0, 10));

  return { ticker, closes, dates };
}
