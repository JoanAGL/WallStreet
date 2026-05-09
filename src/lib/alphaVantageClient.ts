const BASE_URL = "https://www.alphavantage.co/query";

function getApiKey(): string {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) throw new Error("ALPHA_VANTAGE_API_KEY no configurada");
  return key;
}

async function fetchAlphaVantage<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(BASE_URL);
  url.searchParams.set("apikey", getApiKey());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });

  if (!res.ok) {
    throw new Error(`Alpha Vantage HTTP error: ${res.status}`);
  }

  const data = await res.json() as T;
  return data;
}

export interface RawGlobalQuote {
  "Global Quote": {
    "01. symbol": string;
    "05. price": string;
    "08. previous close": string;
    "09. change": string;
    "10. change percent": string;
  };
}

export interface RawDailySeries {
  "Time Series (Daily)": Record<
    string,
    {
      "1. open": string;
      "2. high": string;
      "3. low": string;
      "4. close": string;
      "5. volume": string;
    }
  >;
}

export async function fetchGlobalQuote(ticker: string): Promise<RawGlobalQuote> {
  return fetchAlphaVantage<RawGlobalQuote>({
    function: "GLOBAL_QUOTE",
    symbol: ticker,
  });
}

export async function fetchDailySeries(ticker: string): Promise<RawDailySeries> {
  return fetchAlphaVantage<RawDailySeries>({
    function: "TIME_SERIES_DAILY",
    symbol: ticker,
    outputsize: "compact", // últimos 100 días
  });
}
