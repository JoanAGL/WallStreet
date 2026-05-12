const BASE_URL = "https://query2.finance.yahoo.com/v8/finance/chart";

interface YahooChartResult {
  timestamp: number[];
  indicators: {
    quote: Array<{ close: (number | null)[] }>;
  };
}

interface YahooChartResponse {
  chart: {
    result: YahooChartResult[] | null;
    error: { code: string; description: string } | null;
  };
}

export interface YahooCandles {
  closes: number[];
  timestamps: number[];
}

/**
 * Comprueba si un ticker existe en Yahoo Finance haciendo una petición
 * mínima (5 días). Devuelve false ante cualquier error o datos vacíos.
 */
export async function validateTickerExists(ticker: string): Promise<boolean> {
  const url = `${BASE_URL}/${encodeURIComponent(ticker)}?interval=1d&range=5d&includePrePost=false`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 0 },
    });

    if (!res.ok) return false;

    const data = (await res.json()) as YahooChartResponse;

    if (data.chart.error) return false;

    const result = data.chart.result?.[0];
    if (!result?.timestamp?.length) return false;

    const closes = result.indicators.quote[0]?.close ?? [];
    return closes.some((c) => c != null && c > 0);
  } catch {
    return false;
  }
}

export async function fetchYahooCandles(
  ticker: string,
  days = 60
): Promise<YahooCandles> {
  const range = days <= 30 ? "1mo" : days <= 90 ? "3mo" : "6mo";
  const url = `${BASE_URL}/${encodeURIComponent(ticker)}?interval=1d&range=${range}&includePrePost=false`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance error ${res.status}`);
  }

  const data = (await res.json()) as YahooChartResponse;

  if (data.chart.error) {
    throw new Error(`Yahoo Finance: ${data.chart.error.description}`);
  }

  const result = data.chart.result?.[0];
  if (!result?.timestamp?.length) {
    throw new Error(`Sin datos históricos para: ${ticker}`);
  }

  const rawCloses = result.indicators.quote[0]?.close ?? [];

  // Filtra entradas con close null (días sin datos)
  const filtered = result.timestamp
    .map((t, i) => ({ t, c: rawCloses[i] }))
    .filter((x): x is { t: number; c: number } => x.c != null);

  return {
    timestamps: filtered.map((x) => x.t),
    closes: filtered.map((x) => x.c),
  };
}
