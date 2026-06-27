import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FinancialRow {
  year: number;       // fiscal year, e.g. 2024
  period: "A" | "E"; // Actual or Estimate
  revenue:     number | null;
  grossProfit: number | null;
  ebit:        number | null;
  ebitda:      number | null;
  netIncome:   number | null;
  eps:         number | null;
  // derived (computed in backend)
  grossMargin: number | null;
  ebitMargin:  number | null;
  ebitdaMargin: number | null;
  netMargin:   number | null;
  // YoY growth (filled after sorting)
  revenueYoY:   number | null;
  ebitYoY:      number | null;
  ebitdaYoY:    number | null;
  netIncomeYoY: number | null;
  epsYoY:       number | null;
}

export interface ValuationRow {
  year:       number;
  period:     "A" | "E";
  evEbitda:   number | null;
  evEbit:     number | null;
  peForward:  number | null;
  psForward:  number | null;
}

export interface FinancialsTableData {
  ticker:      string;
  rows:        FinancialRow[];
  valuations:  ValuationRow[];
  ev:          number | null;
  marketCap:   number | null;
  trailingPE:  number | null;
  forwardPE:   number | null;
  nextEarningsDate: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function finnhubKey(): string {
  const k = process.env.FINNHUB_API_KEY;
  if (!k) throw new Error("FINNHUB_API_KEY missing");
  return k;
}

// Safely fetch with 7s timeout (leave margin for Vercel Hobby 10s limit)
async function safeFetch(url: string, init?: { headers?: Record<string, string> }): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      next: { revalidate: 86400 },
      ...(init?.headers ? { headers: init.headers } : {}),
    });
    const sanitized = url.replace(/apikey=[^&]+/, "apikey=***").replace(/token=[^&]+/, "token=***");
    console.log(`[financials-table] fetch ${sanitized} → ${res.status}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    const sanitized = url.replace(/apikey=[^&]+/, "apikey=***").replace(/token=[^&]+/, "token=***");
    console.log(`[financials-table] fetch ${sanitized} → ERROR: ${String(err)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Finnhub historical financials ────────────────────────────────────────────

interface FinnhubFinancialStatement {
  period: string; // "2024-12-31"
  report: {
    ic?: Array<{ concept: string; value: number }>; // income statement
    cf?: Array<{ concept: string; value: number }>; // cash flow
  };
}

function pickFinnhub(items: Array<{ concept: string; value: number }>, ...concepts: string[]): number | null {
  for (const c of concepts) {
    const found = items.find((x) => x.concept === c);
    if (found != null && typeof found.value === "number" && isFinite(found.value)) return found.value;
  }
  return null;
}

async function fetchFinnhubFinancials(ticker: string): Promise<Map<number, Partial<FinancialRow>>> {
  const url = `https://finnhub.io/api/v1/stock/financials?symbol=${encodeURIComponent(ticker)}&statement=ic&freq=annual&token=${finnhubKey()}`;
  const cfUrl = `https://finnhub.io/api/v1/stock/financials?symbol=${encodeURIComponent(ticker)}&statement=cf&freq=annual&token=${finnhubKey()}`;

  const [icRaw, cfRaw] = await Promise.allSettled([safeFetch(url), safeFetch(cfUrl)]);

  const icData = icRaw.status === "fulfilled" ? icRaw.value as { financials?: FinnhubFinancialStatement[] } | null : null;
  const cfData = cfRaw.status === "fulfilled" ? cfRaw.value as { financials?: FinnhubFinancialStatement[] } | null : null;

  const icByYear = new Map<number, Array<{ concept: string; value: number }>>();
  for (const stmt of icData?.financials ?? []) {
    const yr = new Date(stmt.period).getFullYear();
    if (stmt.report.ic) icByYear.set(yr, stmt.report.ic);
  }

  const daByYear = new Map<number, number>(); // D&A from cash flow
  for (const stmt of cfData?.financials ?? []) {
    const yr = new Date(stmt.period).getFullYear();
    const cfItems = stmt.report.cf ?? [];
    const da = pickFinnhub(cfItems, "depreciationAmortization", "depreciationAndAmortization");
    if (da != null) daByYear.set(yr, Math.abs(da));
  }

  const result = new Map<number, Partial<FinancialRow>>();
  for (const [yr, ic] of Array.from(icByYear.entries())) {
    const revenue    = pickFinnhub(ic, "totalRevenue", "revenue", "netRevenue");
    const gross      = pickFinnhub(ic, "grossProfit");
    const ebit       = pickFinnhub(ic, "ebit", "operatingIncome");
    const netIncome  = pickFinnhub(ic, "netIncome", "netIncomeApplicableToCommonShares");
    const eps        = pickFinnhub(ic, "dilutedEPS", "basicEPS", "eps");
    const da         = daByYear.get(yr) ?? null;
    const ebitda     = ebit != null && da != null ? ebit + da : null;

    result.set(yr, {
      revenue,
      grossProfit: gross,
      ebit,
      ebitda,
      netIncome,
      eps,
      grossMargin:  revenue && gross   ? (gross / revenue) * 100       : null,
      ebitMargin:   revenue && ebit    ? (ebit / revenue) * 100         : null,
      ebitdaMargin: revenue && ebitda  ? (ebitda / revenue) * 100       : null,
      netMargin:    revenue && netIncome ? (netIncome / revenue) * 100  : null,
    });
  }
  return result;
}

// ── Yahoo Finance historical financials (quarterly → aggregated annual) ───────

interface YahooRV { raw: number }

interface YahooIncomeStmt {
  endDate:          YahooRV;
  totalRevenue?:    YahooRV;
  ebitda?:          YahooRV;
  netIncome?:       YahooRV;
  basicEPS?:        YahooRV;
  operatingIncome?: YahooRV;
}

interface YahooCashflowStmt {
  endDate:       YahooRV;
  depreciation?: YahooRV;
}

interface YahooQuoteSummaryData {
  quoteSummary: {
    result: Array<{
      incomeStatementHistoryQuarterly:   { incomeStatementHistory: YahooIncomeStmt[] };
      cashflowStatementHistoryQuarterly: { cashflowStatements:     YahooCashflowStmt[] };
    }> | null;
  };
}

async function fetchYahooFinancials(ticker: string): Promise<Map<number, Partial<FinancialRow>>> {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=incomeStatementHistoryQuarterly,cashflowStatementHistoryQuarterly`;
  const data = await safeFetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }) as YahooQuoteSummaryData | null;

  const qsr       = data?.quoteSummary?.result?.[0];
  const incomeQ   = qsr?.incomeStatementHistoryQuarterly?.incomeStatementHistory   ?? [];
  const cashflowQ = qsr?.cashflowStatementHistoryQuarterly?.cashflowStatements     ?? [];

  console.log("[financials-table] Yahoo items count:", incomeQ.length);
  if (incomeQ.length > 0) console.log("[financials-table] sample:", JSON.stringify(incomeQ[0]));
  if (incomeQ.length === 0) return new Map();

  // Extract numeric value from Yahoo's { raw: number } wrapper
  const rv = (obj: YahooRV | undefined): number | null =>
    obj != null && typeof obj.raw === "number" && isFinite(obj.raw) ? obj.raw : null;

  // Yahoo returns absolute USD; divide by 1_000_000 to match codebase unit ($M)
  const toM = (v: number | null): number | null => (v != null ? v / 1_000_000 : null);

  // Build D&A lookup: quarter endDate timestamp → depreciation (absolute USD)
  const daMap = new Map<number, number>();
  for (const cf of cashflowQ) {
    const ts = rv(cf.endDate);
    const da = rv(cf.depreciation);
    if (ts != null && da != null) daMap.set(ts, Math.abs(da));
  }

  // Group quarterly income statements by calendar year
  const byYear = new Map<number, YahooIncomeStmt[]>();
  for (const stmt of incomeQ) {
    const ts = rv(stmt.endDate);
    if (ts == null) continue;
    const yr = new Date(ts * 1000).getFullYear();
    if (!byYear.has(yr)) byYear.set(yr, []);
    byYear.get(yr)!.push(stmt);
  }

  const result = new Map<number, Partial<FinancialRow>>();

  for (const [yr, quarters] of Array.from(byYear.entries())) {
    const sumAbs = (field: keyof YahooIncomeStmt): number | null => {
      const vals = quarters
        .map((q) => rv(q[field] as YahooRV | undefined))
        .filter((v): v is number => v != null);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : null;
    };

    const revenue   = toM(sumAbs("totalRevenue"));
    const netIncome = toM(sumAbs("netIncome"));
    const eps       = sumAbs("basicEPS"); // per-share: no unit scaling
    const opIncome  = toM(sumAbs("operatingIncome"));

    // Sum D&A matching each quarter's timestamp from the cashflow map
    const daTotalAbs = quarters.reduce((acc, q) => {
      const ts = rv(q.endDate);
      return acc + (ts != null ? (daMap.get(ts) ?? 0) : 0);
    }, 0);
    const da = daTotalAbs > 0 ? daTotalAbs / 1_000_000 : null;

    // Prefer explicit EBITDA; fall back to operatingIncome + D&A
    const rawEbitda = toM(sumAbs("ebitda"));
    const ebitda = rawEbitda && rawEbitda > 0 ? rawEbitda
      : opIncome != null && da != null ? opIncome + da : null;

    result.set(yr, {
      revenue,
      ebitda,
      ebit:        opIncome,
      netIncome,
      eps,
      grossProfit: null,
      grossMargin:  null,
      ebitMargin:   revenue && opIncome  ? (opIncome  / revenue) * 100 : null,
      ebitdaMargin: revenue && ebitda    ? (ebitda    / revenue) * 100 : null,
      netMargin:    revenue && netIncome ? (netIncome / revenue) * 100 : null,
    });
  }

  return result;
}

// ── Finnhub EV & earnings date ────────────────────────────────────────────────

async function fetchEvMetrics(ticker: string): Promise<{ ev: number | null; marketCap: number | null; trailingPE: number | null; forwardPE: number | null }> {
  const url = `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(ticker)}&metric=all&token=${finnhubKey()}`;
  const raw = await safeFetch(url) as { metric?: Record<string, number | null> } | null;
  const m = raw?.metric ?? {};
  const n = (k: string): number | null => {
    const v = m[k];
    return typeof v === "number" && isFinite(v) ? v : null;
  };
  return {
    ev:         n("enterpriseValue"),
    marketCap:  n("marketCapitalization"),
    trailingPE: n("peNormalizedAnnual") ?? n("peTTM"),
    forwardPE:  n("peForward") ?? n("peExclExtraItemsTTM"),
  };
}

async function fetchNextEarningsDate(ticker: string): Promise<string | null> {
  const url = `https://finnhub.io/api/v1/stock/earnings?symbol=${encodeURIComponent(ticker)}&token=${finnhubKey()}`;
  const raw = await safeFetch(url) as Array<{ date: string; epsActual: number | null }> | null;
  if (!Array.isArray(raw)) return null;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = raw.filter((r) => r.date >= today && r.epsActual == null);
  return upcoming[0]?.date ?? null;
}

// ── YoY growth ────────────────────────────────────────────────────────────────

function addYoY(rows: FinancialRow[]): FinancialRow[] {
  const sorted = [...rows].sort((a, b) => a.year - b.year);
  return sorted.map((row, i) => {
    if (i === 0) return row;
    const prev = sorted[i - 1];
    const yoy = (curr: number | null, p: number | null): number | null =>
      curr != null && p != null && p !== 0 ? ((curr - p) / Math.abs(p)) * 100 : null;
    return {
      ...row,
      revenueYoY:   yoy(row.revenue,    prev.revenue),
      ebitYoY:      yoy(row.ebit,       prev.ebit),
      ebitdaYoY:    yoy(row.ebitda,     prev.ebitda),
      netIncomeYoY: yoy(row.netIncome,  prev.netIncome),
      epsYoY:       yoy(row.eps,        prev.eps),
    };
  });
}

// ── Valuation rows ────────────────────────────────────────────────────────────

function buildValuations(rows: FinancialRow[], ev: number | null, marketCap: number | null): ValuationRow[] {
  // Finnhub metric returns ev/marketCap in $M; FinancialRow values are also in $M,
  // so ratios divide same-unit values directly (no scaling needed).
  return rows.map((r) => ({
    year:      r.year,
    period:    r.period,
    evEbitda:  ev        && r.ebitda    && r.ebitda    > 0 ? ev        / r.ebitda    : null,
    evEbit:    ev        && r.ebit      && r.ebit      > 0 ? ev        / r.ebit      : null,
    peForward: marketCap && r.netIncome && r.netIncome > 0 ? marketCap / r.netIncome : null,
    psForward: marketCap && r.revenue   && r.revenue   > 0 ? marketCap / r.revenue   : null,
  }));
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").toUpperCase();
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  const [histMap, yahooActMap, evData, nextEarnings] = await Promise.allSettled([
    fetchFinnhubFinancials(ticker),
    fetchYahooFinancials(ticker),
    fetchEvMetrics(ticker),
    fetchNextEarningsDate(ticker),
  ]);

  const finnhubHist = histMap.status     === "fulfilled" ? histMap.value     : new Map<number, Partial<FinancialRow>>();
  const yahooAct    = yahooActMap.status === "fulfilled" ? yahooActMap.value : new Map<number, Partial<FinancialRow>>();
  const ev          = evData.status      === "fulfilled" ? evData.value      : { ev: null, marketCap: null, trailingPE: null, forwardPE: null };
  const earningsDate = nextEarnings.status === "fulfilled" ? nextEarnings.value : null;

  // Merge Finnhub (annual, has grossProfit) + Yahoo (quarterly→annual).
  // Yahoo values take priority for ebitda/netIncome/eps; Finnhub kept for grossProfit.
  const hist = new Map<number, Partial<FinancialRow>>();
  const allYears = new Set<number>([...Array.from(finnhubHist.keys()), ...Array.from(yahooAct.keys())]);
  for (const yr of Array.from(allYears)) {
    const fh    = finnhubHist.get(yr) ?? {};
    const yahoo = yahooAct.get(yr)    ?? {};
    const revenue   = yahoo.revenue    ?? fh.revenue    ?? null;
    const ebit      = yahoo.ebit       ?? fh.ebit       ?? null;
    const ebitda    = yahoo.ebitda     ?? fh.ebitda     ?? null;
    const netIncome = yahoo.netIncome  ?? fh.netIncome  ?? null;
    const eps       = yahoo.eps        ?? fh.eps        ?? null;
    const gross     = fh.grossProfit   ?? null; // only Finnhub provides this
    hist.set(yr, {
      revenue,
      grossProfit:  gross,
      ebit,
      ebitda,
      netIncome,
      eps,
      grossMargin:  revenue && gross     ? (gross     / revenue) * 100 : null,
      ebitMargin:   revenue && ebit      ? (ebit      / revenue) * 100 : null,
      ebitdaMargin: revenue && ebitda    ? (ebitda    / revenue) * 100 : null,
      netMargin:    revenue && netIncome ? (netIncome / revenue) * 100 : null,
    });
  }

  const allRows: FinancialRow[] = [];

  for (const [yr, data] of Array.from(hist.entries())) {
    allRows.push({
      year: yr,
      period: "A",
      revenue:     data.revenue     ?? null,
      grossProfit: data.grossProfit ?? null,
      ebit:        data.ebit        ?? null,
      ebitda:      data.ebitda      ?? null,
      netIncome:   data.netIncome   ?? null,
      eps:         data.eps         ?? null,
      grossMargin:  data.grossMargin  ?? null,
      ebitMargin:   data.ebitMargin   ?? null,
      ebitdaMargin: data.ebitdaMargin ?? null,
      netMargin:    data.netMargin    ?? null,
      revenueYoY:   null,
      ebitYoY:      null,
      ebitdaYoY:    null,
      netIncomeYoY: null,
      epsYoY:       null,
    });
  }

  // Keep last 4 actuals
  const combined = addYoY(allRows.sort((a, b) => a.year - b.year).slice(-4));
  const valuations = buildValuations(combined, ev.ev, ev.marketCap);

  const payload: FinancialsTableData = {
    ticker,
    rows:       combined,
    valuations,
    ev:         ev.ev,
    marketCap:  ev.marketCap,
    trailingPE: ev.trailingPE,
    forwardPE:  ev.forwardPE,
    nextEarningsDate: earningsDate,
  };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=3600" },
  });
}
