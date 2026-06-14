const BASE_URL = "https://finnhub.io/api/v1";

function getToken(): string {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) throw new Error("FINNHUB_API_KEY no configurada");
  return token;
}

export interface FinnhubQuote {
  c: number;  // current price
  d: number;  // change
  dp: number; // percent change
  h: number;  // high of day
  l: number;  // low of day
  o: number;  // open
  pc: number; // previous close
  t: number;  // timestamp
}

export interface FinnhubCandles {
  c: number[];
  h: number[];
  l: number[];
  o: number[];
  s: string;   // "ok" | "no_data"
  t: number[]; // unix timestamps
  v: number[];
}

export async function fetchQuote(ticker: string): Promise<FinnhubQuote> {
  const url = `${BASE_URL}/quote?symbol=${encodeURIComponent(ticker)}&token=${getToken()}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Finnhub quote error ${res.status}: ${body}`);
  }
  return res.json() as Promise<FinnhubQuote>;
}

export interface StockProfile {
  name:                 string;
  ticker:               string;
  exchange:             string;
  finnhubIndustry:      string;
  marketCapitalization: number | null;
  logo:                 string;
  weburl:               string;
  description:          string;
}

export async function fetchStockProfile(ticker: string): Promise<StockProfile | null> {
  try {
    const url = `${BASE_URL}/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${getToken()}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json() as Partial<StockProfile>;
    if (!data.name) return null;
    return {
      name:                 data.name ?? ticker,
      ticker:               data.ticker ?? ticker,
      exchange:             data.exchange ?? "",
      finnhubIndustry:      data.finnhubIndustry ?? "",
      marketCapitalization: data.marketCapitalization ?? null,
      logo:                 data.logo ?? "",
      weburl:               data.weburl ?? "",
      description:          data.description ?? "",
    };
  } catch {
    return null;
  }
}

export interface StockMetrics {
  peNormalizedAnnual:         number | null;
  pbAnnual:                   number | null;
  psTTM:                      number | null;
  roeTTM:                     number | null;
  roaTTM:                     number | null;
  grossMarginTTM:             number | null;
  netMarginTTM:               number | null;
  beta:                       number | null;
  epsGrowthTTMYoy:            number | null;
  dividendYieldIndicatedAnnual: number | null;
  "52WeekHigh":               number | null;
  "52WeekLow":                number | null;
  debtEquityAnnual:           number | null;
  currentRatioAnnual:         number | null;
  revenueGrowthTTMYoy:        number | null;
}

export async function fetchStockMetrics(ticker: string): Promise<StockMetrics | null> {
  try {
    const url = `${BASE_URL}/stock/metric?symbol=${encodeURIComponent(ticker)}&metric=all&token=${getToken()}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json() as { metric?: Record<string, number | null> };
    const m = data.metric ?? {};
    const n = (k: string): number | null => {
      const v = m[k];
      return typeof v === "number" && isFinite(v) ? v : null;
    };
    return {
      peNormalizedAnnual:           n("peNormalizedAnnual"),
      pbAnnual:                     n("pbAnnual"),
      psTTM:                        n("psTTM"),
      roeTTM:                       n("roeTTM"),
      roaTTM:                       n("roaTTM"),
      grossMarginTTM:               n("grossMarginTTM"),
      netMarginTTM:                 n("netMarginTTM"),
      beta:                         n("beta"),
      epsGrowthTTMYoy:              n("epsGrowthTTMYoy"),
      dividendYieldIndicatedAnnual: n("dividendYieldIndicatedAnnual"),
      "52WeekHigh":                 n("52WeekHigh"),
      "52WeekLow":                  n("52WeekLow"),
      debtEquityAnnual:             n("debtEquityAnnual"),
      currentRatioAnnual:           n("currentRatioAnnual"),
      revenueGrowthTTMYoy:          n("revenueGrowthTTMYoy"),
    };
  } catch {
    return null;
  }
}

export interface StockRecommendation {
  period:     string;
  strongBuy:  number;
  buy:        number;
  hold:       number;
  sell:       number;
  strongSell: number;
}

export async function fetchStockRecommendations(ticker: string): Promise<StockRecommendation[]> {
  try {
    const url = `${BASE_URL}/stock/recommendation?symbol=${encodeURIComponent(ticker)}&token=${getToken()}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    return (await res.json()) as StockRecommendation[];
  } catch {
    return [];
  }
}

export async function fetchDailyCandles(
  ticker: string,
  days = 60
): Promise<FinnhubCandles> {
  const to = Math.floor(Date.now() / 1000);
  // Request extra days to account for weekends and holidays
  const from = to - Math.ceil(days * 1.5) * 24 * 60 * 60;
  const url = `${BASE_URL}/stock/candle?symbol=${encodeURIComponent(ticker)}&resolution=D&from=${from}&to=${to}&token=${getToken()}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Finnhub candles error ${res.status}: ${body}`);
  }
  const data = (await res.json()) as FinnhubCandles;
  if (data.s === "no_data" || !data.c?.length) {
    throw new Error(`Sin datos históricos para: ${ticker}`);
  }
  return data;
}
