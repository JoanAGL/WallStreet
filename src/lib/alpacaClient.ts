const BASE_URL = "https://data.alpaca.markets/v2";

function getHeaders(): Record<string, string> {
  const key = process.env.ALPACA_KEY;
  const secret = process.env.ALPACA_SECRET;
  if (!key || !secret) throw new Error("ALPACA_KEY o ALPACA_SECRET no configuradas");
  return {
    "APCA-API-KEY-ID": key,
    "APCA-API-SECRET-KEY": secret,
    "Accept": "application/json",
  };
}

export interface AlpacaBar {
  t: string;  // timestamp ISO
  o: number;  // open
  h: number;  // high
  l: number;  // low
  c: number;  // close
  v: number;  // volume
}

export interface AlpacaBarsResponse {
  bars: AlpacaBar[];
  symbol: string;
  next_page_token: string | null;
}

export interface AlpacaLatestBarResponse {
  bar: AlpacaBar;
  symbol: string;
}

/**
 * Obtiene las últimas `limit` barras diarias de un ticker.
 */
export async function fetchDailyBars(
  ticker: string,
  limit = 60
): Promise<AlpacaBar[]> {
  const url = new URL(`${BASE_URL}/stocks/${encodeURIComponent(ticker)}/bars`);
  url.searchParams.set("timeframe", "1Day");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("adjustment", "split");
  url.searchParams.set("feed", "iex");

  const res = await fetch(url.toString(), {
    headers: getHeaders(),
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Alpaca bars error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as AlpacaBarsResponse;
  return data.bars ?? [];
}

/**
 * Obtiene la barra diaria más reciente de un ticker.
 */
export async function fetchLatestBar(ticker: string): Promise<AlpacaBar> {
  const url = new URL(
    `${BASE_URL}/stocks/${encodeURIComponent(ticker)}/bars/latest`
  );
  url.searchParams.set("feed", "iex");

  const res = await fetch(url.toString(), {
    headers: getHeaders(),
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Alpaca latest bar error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as AlpacaLatestBarResponse;
  if (!data.bar) throw new Error(`Sin datos para: ${ticker}`);
  return data.bar;
}
