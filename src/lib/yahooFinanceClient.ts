import type { InvestmentHorizon } from "@/types/models";

const BASE_URL = "https://query2.finance.yahoo.com/v8/finance/chart";
const SUMMARY_URL = "https://query2.finance.yahoo.com/v10/finance/quoteSummary";

interface YahooChartResult {
  timestamp: number[];
  indicators: {
    quote: Array<{
      close:  (number | null)[];
      high:   (number | null)[];
      low:    (number | null)[];
      volume: (number | null)[];
    }>;
  };
}

interface YahooChartResponse {
  chart: {
    result: YahooChartResult[] | null;
    error: { code: string; description: string } | null;
  };
}

// ── Fundamentals (quoteSummary) ──────────────────────────────────────────────

interface YahooRaw { raw: number }
type MaybeRaw = YahooRaw | null | undefined;
const raw = (v: MaybeRaw): number | null => (v?.raw != null ? v.raw : null);

interface YahooSummaryResponse {
  quoteSummary: {
    result: [{
      defaultKeyStatistics?: {
        beta?: MaybeRaw;
        forwardEps?: MaybeRaw;
        pegRatio?: MaybeRaw;
        enterpriseValue?: MaybeRaw;
      } | null;
      financialData?: {
        revenueGrowth?: MaybeRaw;
        returnOnEquity?: MaybeRaw;
        debtToEquity?: MaybeRaw;
        freeCashflow?: MaybeRaw;
        profitMargins?: MaybeRaw;
        earningsGrowth?: MaybeRaw;
      } | null;
      summaryDetail?: {
        trailingPE?: MaybeRaw;
        dividendYield?: MaybeRaw;
        marketCap?: MaybeRaw;
        payoutRatio?: MaybeRaw;
        beta?: MaybeRaw;
      } | null;
    }] | null;
    error: unknown;
  };
}

export interface MediumTermFundamentals {
  revenueGrowthYoY: number | null;
  forwardEps: number | null;
  pegRatio: number | null;
  debtToEquity: number | null;
  returnOnEquity: number | null;
}

export interface LongTermFundamentals {
  trailingPE: number | null;
  dividendYield: number | null;
  profitMargin: number | null;
  freeCashflowYield: number | null;
  beta: number | null;
}

export type FundamentalMetrics =
  | ({ horizon: "MEDIUM_TERM" } & MediumTermFundamentals)
  | ({ horizon: "LONG_TERM" }  & LongTermFundamentals);

export async function fetchFundamentals(
  ticker: string,
  horizon: InvestmentHorizon
): Promise<FundamentalMetrics> {
  const url = `${SUMMARY_URL}/${encodeURIComponent(ticker)}?modules=defaultKeyStatistics,financialData,summaryDetail`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Yahoo quoteSummary HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as YahooSummaryResponse;

    if (data.quoteSummary?.error) {
      throw new Error(`Yahoo quoteSummary error: ${JSON.stringify(data.quoteSummary.error)}`);
    }

    const r = data.quoteSummary?.result?.[0];

    if (!r) throw new Error("Sin datos fundamentales: result vacío");

    const ks = r.defaultKeyStatistics;
    const fd = r.financialData;
    const sd = r.summaryDetail;

    if (horizon === "MEDIUM_TERM") {
      return {
        horizon: "MEDIUM_TERM",
        revenueGrowthYoY: raw(fd?.revenueGrowth),
        forwardEps:       raw(ks?.forwardEps),
        pegRatio:         raw(ks?.pegRatio),
        debtToEquity:     raw(fd?.debtToEquity),
        returnOnEquity:   raw(fd?.returnOnEquity),
      };
    }

    // LONG_TERM
    const fcf = raw(fd?.freeCashflow);
    const mktCap = raw(sd?.marketCap);
    const fcfYield = fcf != null && mktCap != null && mktCap > 0
      ? fcf / mktCap
      : null;

    return {
      horizon: "LONG_TERM",
      trailingPE:       raw(sd?.trailingPE),
      dividendYield:    raw(sd?.dividendYield),
      profitMargin:     raw(fd?.profitMargins),
      freeCashflowYield: fcfYield,
      beta:             raw(sd?.beta ?? ks?.beta),
    };
  } catch (err) {
    console.error(`[fetchFundamentals] ${ticker} (${horizon}):`, err instanceof Error ? err.message : err);
    if (horizon === "MEDIUM_TERM") {
      return { horizon: "MEDIUM_TERM", revenueGrowthYoY: null, forwardEps: null, pegRatio: null, debtToEquity: null, returnOnEquity: null };
    }
    return { horizon: "LONG_TERM", trailingPE: null, dividendYield: null, profitMargin: null, freeCashflowYield: null, beta: null };
  }
}

// ── Chart (candles) ──────────────────────────────────────────────────────────

export interface YahooCandles {
  closes:     number[];
  highs:      number[];
  lows:       number[];
  volumes:    number[];
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

  const q = result.indicators.quote[0];
  const rawCloses  = q?.close  ?? [];
  const rawHighs   = q?.high   ?? [];
  const rawLows    = q?.low    ?? [];
  const rawVolumes = q?.volume ?? [];

  // Filtra días sin precio de cierre
  const filtered = result.timestamp
    .map((t, i) => ({
      t,
      c: rawCloses[i],
      h: rawHighs[i],
      l: rawLows[i],
      v: rawVolumes[i],
    }))
    .filter((x): x is { t: number; c: number; h: number; l: number; v: number } =>
      x.c != null
    );

  return {
    timestamps: filtered.map((x) => x.t),
    closes:     filtered.map((x) => x.c),
    highs:      filtered.map((x) => x.h ?? x.c),
    lows:       filtered.map((x) => x.l ?? x.c),
    volumes:    filtered.map((x) => x.v ?? 0),
  };
}
