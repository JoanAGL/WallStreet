import type { InvestmentHorizon } from "@/types/models";

const BASE_URL    = "https://query2.finance.yahoo.com/v8/finance/chart";
const SUMMARY_URL = "https://query2.finance.yahoo.com/v10/finance/quoteSummary";
const YAHOO_UA    = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchYahooCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  try {
    const consentRes = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": YAHOO_UA },
      redirect: "follow",
    });
    const setCookie = consentRes.headers.get("set-cookie") ?? "";
    const cookie = setCookie.split(",").map(c => c.split(";")[0].trim()).filter(Boolean).join("; ");

    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": YAHOO_UA, "Cookie": cookie },
    });
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.length < 3 || crumb.startsWith("<")) return null;
    return { crumb, cookie };
  } catch {
    return null;
  }
}

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

export interface AllFundamentals {
  medium: MediumTermFundamentals;
  long:   LongTermFundamentals;
}

const NULL_MEDIUM: MediumTermFundamentals = { revenueGrowthYoY: null, forwardEps: null, pegRatio: null, debtToEquity: null, returnOnEquity: null };
const NULL_LONG:   LongTermFundamentals   = { trailingPE: null, dividendYield: null, profitMargin: null, freeCashflowYield: null, beta: null };

async function fetchQuoteSummaryRaw(ticker: string): Promise<YahooSummaryResponse["quoteSummary"]["result"]> {
  const url = `${SUMMARY_URL}/${encodeURIComponent(ticker)}?modules=defaultKeyStatistics,financialData,summaryDetail`;
  const auth = await fetchYahooCrumb();
  const urlWithCrumb = auth ? `${url}&crumb=${encodeURIComponent(auth.crumb)}` : url;

  const headers: Record<string, string> = {
    "User-Agent": YAHOO_UA,
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
  };
  if (auth?.cookie) headers["Cookie"] = auth.cookie;

  const res = await fetch(urlWithCrumb, { headers, next: { revalidate: 0 } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Yahoo quoteSummary HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as YahooSummaryResponse;
  if (data.quoteSummary?.error) throw new Error(`Yahoo error: ${JSON.stringify(data.quoteSummary.error)}`);
  return data.quoteSummary?.result ?? null;
}

/** Fetches MEDIUM + LONG fundamentals in a single API call. Never throws. */
export async function fetchAllFundamentals(ticker: string): Promise<AllFundamentals> {
  try {
    const result = await fetchQuoteSummaryRaw(ticker);
    const r = result?.[0];
    if (!r) throw new Error("result vacío");

    const ks = r.defaultKeyStatistics;
    const fd = r.financialData;
    const sd = r.summaryDetail;

    const fcf    = raw(fd?.freeCashflow);
    const mktCap = raw(sd?.marketCap);
    const fcfYield = fcf != null && mktCap != null && mktCap > 0 ? fcf / mktCap : null;

    return {
      medium: {
        revenueGrowthYoY: raw(fd?.revenueGrowth),
        forwardEps:       raw(ks?.forwardEps),
        pegRatio:         raw(ks?.pegRatio),
        debtToEquity:     raw(fd?.debtToEquity),
        returnOnEquity:   raw(fd?.returnOnEquity),
      },
      long: {
        trailingPE:        raw(sd?.trailingPE),
        dividendYield:     raw(sd?.dividendYield),
        profitMargin:      raw(fd?.profitMargins),
        freeCashflowYield: fcfYield,
        beta:              raw(sd?.beta ?? ks?.beta),
      },
    };
  } catch (err) {
    console.error(`[fetchAllFundamentals] ${ticker}:`, err instanceof Error ? err.message : err);
    return { medium: NULL_MEDIUM, long: NULL_LONG };
  }
}

/** @deprecated Use fetchAllFundamentals. Kept for compatibility. */
export async function fetchFundamentals(ticker: string, horizon: InvestmentHorizon): Promise<FundamentalMetrics> {
  const all = await fetchAllFundamentals(ticker);
  return horizon === "MEDIUM_TERM"
    ? { horizon: "MEDIUM_TERM", ...all.medium }
    : { horizon: "LONG_TERM",   ...all.long };
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
