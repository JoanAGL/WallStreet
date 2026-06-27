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

function fmpKey(): string | null {
  return process.env.FMP_API_KEY ?? null;
}

function finnhubKey(): string {
  const k = process.env.FINNHUB_API_KEY;
  if (!k) throw new Error("FINNHUB_API_KEY missing");
  return k;
}

// Safely fetch with 7s timeout (leave margin for Vercel Hobby 10s limit)
async function safeFetch(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, next: { revalidate: 86400 } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
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
    const items = stmt.report.cf ?? [];
    const da = pickFinnhub(items, "depreciationAmortization", "depreciationAndAmortization");
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

// ── FMP forward estimates ────────────────────────────────────────────────────

interface FmpEstimate {
  date:            string; // "2025-12-31"
  revenueAvg:      number | null;
  ebitdaAvg:       number | null;
  netIncomeAvg:    number | null;
  epsAvg:          number | null;
  revenueHigh?:    number | null;
  revenueLow?:     number | null;
}

async function fetchFmpEstimates(ticker: string): Promise<Map<number, Partial<FinancialRow>>> {
  const key = fmpKey();
  if (!key) return new Map();

  const url = `https://financialmodelingprep.com/api/v3/analyst-estimates/${encodeURIComponent(ticker)}?apikey=${key}`;
  const raw = await safeFetch(url) as FmpEstimate[] | null;
  if (!Array.isArray(raw)) return new Map();

  const result = new Map<number, Partial<FinancialRow>>();
  const now = new Date().getFullYear();

  for (const item of raw) {
    const yr = new Date(item.date).getFullYear();
    // Only include future/current years as estimates
    if (yr < now) continue;
    result.set(yr, {
      revenue:     item.revenueAvg    ?? null,
      ebitda:      item.ebitdaAvg     ?? null,
      netIncome:   item.netIncomeAvg  ?? null,
      eps:         item.epsAvg        ?? null,
      grossProfit: null,
      ebit:        null,
      grossMargin:  null,
      ebitMargin:   null,
      ebitdaMargin: null,
      netMargin:    null,
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
  const evM = ev != null ? ev * 1e6 : null;
  const mcM = marketCap != null ? marketCap * 1e6 : null;

  return rows.map((r) => ({
    year:      r.year,
    period:    r.period,
    evEbitda:  evM && r.ebitda && r.ebitda > 0 ? evM / r.ebitda : null,
    evEbit:    evM && r.ebit   && r.ebit   > 0 ? evM / r.ebit   : null,
    peForward: mcM && r.netIncome && r.netIncome > 0 ? mcM / r.netIncome : null,
    psForward: mcM && r.revenue   && r.revenue   > 0 ? mcM / r.revenue   : null,
  }));
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").toUpperCase();
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  const [histMap, fwdMap, evData, nextEarnings] = await Promise.allSettled([
    fetchFinnhubFinancials(ticker),
    fetchFmpEstimates(ticker),
    fetchEvMetrics(ticker),
    fetchNextEarningsDate(ticker),
  ]);

  const hist       = histMap.status === "fulfilled" ? histMap.value : new Map<number, Partial<FinancialRow>>();
  const fwd        = fwdMap.status  === "fulfilled" ? fwdMap.value  : new Map<number, Partial<FinancialRow>>();
  const ev         = evData.status  === "fulfilled" ? evData.value  : { ev: null, marketCap: null, trailingPE: null, forwardPE: null };
  const earningsDate = nextEarnings.status === "fulfilled" ? nextEarnings.value : null;

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

  for (const [yr, data] of Array.from(fwd.entries())) {
    if (!hist.has(yr)) {
      const rev = data.revenue ?? null;
      const ebitda = data.ebitda ?? null;
      const ni = data.netIncome ?? null;
      allRows.push({
        year: yr,
        period: "E",
        revenue:     rev,
        grossProfit: null,
        ebit:        null,
        ebitda:      ebitda,
        netIncome:   ni,
        eps:         data.eps ?? null,
        grossMargin:  null,
        ebitMargin:   null,
        ebitdaMargin: rev && ebitda ? (ebitda / rev) * 100 : null,
        netMargin:    rev && ni     ? (ni / rev) * 100     : null,
        revenueYoY:   null,
        ebitYoY:      null,
        ebitdaYoY:    null,
        netIncomeYoY: null,
        epsYoY:       null,
      });
    }
  }

  // Keep last 4 actuals + up to 3 estimates
  const actuals   = allRows.filter((r) => r.period === "A").sort((a, b) => a.year - b.year).slice(-4);
  const estimates = allRows.filter((r) => r.period === "E").sort((a, b) => a.year - b.year).slice(0, 3);
  const combined  = addYoY([...actuals, ...estimates]);

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
