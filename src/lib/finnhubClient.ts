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
