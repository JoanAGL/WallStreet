import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStocksWithAnalysis } from "@/repositories/stockRepository";
import { getHistoricalCloses } from "@/services/marketDataService";
import { runMonteCarlo } from "@/lib/portfolioMath";

export const dynamic = "force-dynamic";

function dailyStats(allCloses: number[][]): { mu: number; sigma: number } {
  const allReturns: number[] = [];
  for (const closes of allCloses) {
    for (let i = 1; i < closes.length; i++) {
      allReturns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
  }
  if (allReturns.length === 0) return { mu: 0.0003, sigma: 0.015 };
  const mu = allReturns.reduce((s, v) => s + v, 0) / allReturns.length;
  const variance = allReturns.reduce((s, v) => s + (v - mu) ** 2, 0) / allReturns.length;
  return { mu, sigma: Math.sqrt(variance) };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    horizon?: number;
    monthlyContribution?: number;
    portfolioValue?: number;
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

  const allCloses: number[][] = [];
  historicalResults.forEach((r) => {
    if (r.status === "fulfilled" && r.value.closes.length >= 10) {
      allCloses.push(r.value.closes);
    }
  });

  if (allCloses.length === 0) {
    return NextResponse.json({ error: "Datos históricos insuficientes." }, { status: 400 });
  }

  const { mu, sigma } = dailyStats(allCloses);

  // Portfolio value: sum of current positions, or user-supplied override
  let S0 = body.portfolioValue ?? 0;
  if (!S0) {
    S0 = withAnalysis.reduce((sum, s) => {
      const price = s.analysis?.price ?? 0;
      const qty = s.quantity ?? 0;
      return sum + price * qty;
    }, 0);
  }
  if (S0 <= 0) S0 = 10000; // sensible default

  const result = runMonteCarlo(mu, sigma, S0, tradingDays, monthlyContribution, 1000);
  return NextResponse.json({ ...result, mu, sigma });
}
