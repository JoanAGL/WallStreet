import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

const FH_BASE = "https://finnhub.io/api/v1";
const RISK_FREE_RATE = 2; // 2% annual

function getToken(): string {
  const t = process.env.FINNHUB_API_KEY;
  if (!t) throw new Error("FINNHUB_API_KEY missing");
  return t;
}

async function safeFetch(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface CandleData {
  c: number[];
  s: string;
  t: number[];
}

function dailyLogReturns(closes: number[]): number[] {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  return rets;
}

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
}

function std(arr: number[]): number {
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length || 1);
  return Math.sqrt(variance);
}

// OLS beta: cov(ticker, sp500) / var(sp500) after aligning by date
function computeBeta(
  tickerTs: number[], tickerRets: number[],
  spTs: number[], spRets: number[]
): number | null {
  // Build SP500 return map: timestamp → index
  const spMap = new Map<number, number>();
  for (let i = 0; i < spTs.length; i++) spMap.set(spTs[i], i);

  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < tickerTs.length; i++) {
    const spIdx = spMap.get(tickerTs[i]);
    if (spIdx != null && tickerRets[i] != null && spRets[spIdx] != null) {
      pairs.push([tickerRets[i], spRets[spIdx]]);
    }
  }
  if (pairs.length < 10) return null;

  const tm = mean(pairs.map(p => p[0]));
  const sm = mean(pairs.map(p => p[1]));
  let cov = 0, varSP = 0;
  for (const [t, s] of pairs) {
    cov   += (t - tm) * (s - sm);
    varSP += (s - sm) ** 2;
  }
  return varSP === 0 ? null : cov / varSP;
}

export interface RiskData {
  ticker: string;
  volatilityPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number | null;
  betaVsSP500: number | null;
  return1YPct: number;
}

export async function GET(
  _req: Request,
  { params }: { params: { ticker: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ticker = params.ticker.toUpperCase();
  const tok = getToken();
  const to   = Math.floor(Date.now() / 1000);
  const from = to - Math.ceil(365 * 1.4) * 24 * 3600; // ~1.4 years to get 252 trading days

  // Fetch ticker candles + SP500 in parallel
  const [candlesRes, spRes] = await Promise.allSettled([
    safeFetch(`${FH_BASE}/stock/candle?symbol=${encodeURIComponent(ticker)}&resolution=D&from=${from}&to=${to}&token=${tok}`),
    safeFetch(`${FH_BASE}/stock/candle?symbol=%5EGSPC&resolution=D&from=${from}&to=${to}&token=${tok}`),
  ]);

  const candles = (candlesRes.status === "fulfilled" ? candlesRes.value : null) as CandleData | null;

  if (!candles || candles.s !== "ok" || !candles.c?.length || candles.c.length < 20) {
    return NextResponse.json({ error: "Insufficient data" }, { status: 404 });
  }

  const closes = candles.c;
  const rets   = dailyLogReturns(closes);

  // Volatility
  const dailyVol  = std(rets);
  const annualVol = dailyVol * Math.sqrt(252) * 100;

  // Annualized return (CAGR over the full period)
  const totalRet  = (closes[closes.length - 1] - closes[0]) / closes[0];
  const tradingDays = closes.length;
  const annualRet = (Math.pow(1 + totalRet, 252 / tradingDays) - 1) * 100;

  // Max drawdown
  let peak = closes[0], maxDD = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    const dd = (peak - c) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  // Sharpe
  const sharpe = annualVol > 0 ? (annualRet - RISK_FREE_RATE) / annualVol : null;

  // 1Y return (simple, not annualized)
  const return1Y = totalRet * 100;

  // Beta vs S&P 500
  const spCandles = (spRes.status === "fulfilled" ? spRes.value : null) as CandleData | null;
  let betaVal: number | null = null;
  if (spCandles && spCandles.s === "ok" && spCandles.c?.length) {
    const spRets = dailyLogReturns(spCandles.c);
    // Use timestamps as date keys (align by trading day)
    const tickerTs = candles.t.slice(1); // skip first (no return for day 0)
    const spTs     = spCandles.t.slice(1);
    betaVal = computeBeta(tickerTs, rets, spTs, spRets);
  }

  const payload: RiskData = {
    ticker,
    volatilityPct: annualVol,
    maxDrawdownPct: maxDD * 100,
    sharpeRatio: sharpe,
    betaVsSP500: betaVal,
    return1YPct: return1Y,
  };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=3600" },
  });
}
