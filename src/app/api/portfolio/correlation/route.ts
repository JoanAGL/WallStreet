import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStocksWithAnalysis } from "@/repositories/stockRepository";
import { getHistoricalCloses } from "@/services/marketDataService";
import { calculateCorrelationMatrix } from "@/lib/portfolioMath";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const stocks = await getStocksWithAnalysis(session.user.id);
  const withAnalysis = stocks.filter((s) => s.analysis);
  if (withAnalysis.length < 2) {
    return NextResponse.json({ error: "Se necesitan al menos 2 acciones con análisis." }, { status: 400 });
  }

  const historicalResults = await Promise.allSettled(
    withAnalysis.map((s) => getHistoricalCloses(s.ticker, 60))
  );

  const historicalData: Record<string, number[]> = {};
  historicalResults.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.closes.length >= 10) {
      historicalData[withAnalysis[i].ticker] = r.value.closes;
    }
  });

  if (Object.keys(historicalData).length < 2) {
    return NextResponse.json({ error: "Datos históricos insuficientes." }, { status: 400 });
  }

  const result = calculateCorrelationMatrix(historicalData);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
