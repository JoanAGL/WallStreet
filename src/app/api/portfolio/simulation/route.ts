import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStocksWithAnalysis } from "@/repositories/stockRepository";
import { getHistoricalCloses } from "@/services/marketDataService";
import { runMonteCarlo } from "@/lib/math/simulation/monteCarlo";
import { runStressTests } from "@/lib/math/simulation/stressTest";

export const dynamic = "force-dynamic";

interface WeightedSeries {
  closes: number[];  // newest-first
  weight: number;    // current market value (USD) of the position
}

/**
 * Computes daily mu and sigma of the PORTFOLIO return series: each day's
 * return is the value-weighted average of the individual stock returns.
 * Pooling per-stock returns (the previous approach) measures the volatility
 * of an average single stock and ignores diversification, overstating
 * portfolio sigma dramatically.
 */
function portfolioDailyStats(series: WeightedSeries[]): { mu: number; sigma: number } {
  const usable = series.filter((s) => s.closes.length >= 2);
  // If no position has a market value (e.g. no purchase data), equal-weight
  const weighted = usable.some((s) => s.weight > 0)
    ? usable.filter((s) => s.weight > 0)
    : usable.map((s) => ({ ...s, weight: 1 }));
  if (weighted.length === 0) return { mu: 0.0003, sigma: 0.015 };

  const len = Math.min(...weighted.map((s) => s.closes.length));
  const returns: number[] = [];
  // closes are newest-first: walk from oldest (len-1) towards newest (0)
  for (let i = len - 1; i >= 1; i--) {
    let acc = 0;
    let wSum = 0;
    for (const s of weighted) {
      const prev = s.closes[i];
      const cur  = s.closes[i - 1];
      if (prev > 0 && cur > 0 && isFinite(prev) && isFinite(cur)) {
        acc  += s.weight * ((cur - prev) / prev);
        wSum += s.weight;
      }
    }
    if (wSum > 0) returns.push(acc / wSum);
  }

  if (returns.length === 0) return { mu: 0.0003, sigma: 0.015 };
  const mu = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.reduce((s, v) => s + (v - mu) ** 2, 0) / returns.length;
  return { mu, sigma: Math.sqrt(variance) };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    horizon?: number;
    monthlyContribution?: number;
    portfolioValue?: number;
    distribution?: 'NORMAL' | 'STUDENT_T';
    degreesOfFreedom?: number;
  };

  const horizonYears = body.horizon ?? 1;
  const monthlyContribution = body.monthlyContribution ?? 0;
  const tradingDays = Math.round(horizonYears * 252);

  const stocks = await getStocksWithAnalysis(session.user.id);
  const withAnalysis = stocks.filter((s) => s.analysis);
  if (withAnalysis.length === 0) {
    return NextResponse.json({ error: "No hay acciones con análisis." }, { status: 400 });
  }

  const historicalResults = await Promise.allSettled(
    withAnalysis.map((s) => getHistoricalCloses(s.ticker, 60))
  );

  const usdValue = (s: (typeof withAnalysis)[number]): number => {
    const price = s.analysis?.priceUSD ?? s.analysis?.price ?? 0;
    const qty = s.quantity ?? 0;
    return price > 0 && qty > 0 ? price * qty : 0;
  };

  const series: WeightedSeries[] = [];
  historicalResults.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.closes.length >= 10) {
      series.push({ closes: r.value.closes, weight: usdValue(withAnalysis[i]) });
    }
  });

  if (series.length === 0) {
    return NextResponse.json({ error: "Datos históricos insuficientes." }, { status: 400 });
  }

  const { mu, sigma } = portfolioDailyStats(series);

  let S0 = body.portfolioValue ?? 0;
  if (!S0) {
    S0 = withAnalysis.reduce((sum, s) => sum + usdValue(s), 0);
  }
  if (S0 <= 0) S0 = 10000;

  const [monteCarlo, stressTests] = await Promise.all([
    Promise.resolve(runMonteCarlo(mu, sigma, S0, tradingDays, monthlyContribution, 1000, body.distribution, body.degreesOfFreedom)),
    Promise.resolve(runStressTests(S0, mu * 252)),
  ]);

  return NextResponse.json({ ...monteCarlo, mu, sigma, stressTests });
}
