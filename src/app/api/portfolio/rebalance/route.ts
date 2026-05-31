import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStocksWithAnalysis } from "@/repositories/stockRepository";
import { getHistoricalCloses } from "@/services/marketDataService";
import { runBlackLitterman, runPortfolioOptimization, detectHarvestOpportunities } from "@/lib/portfolioMath";
import type { BlackLittermanView } from "@/lib/portfolioMath";
import { getGlobalContext } from "@/services/macroService";
import { geminiChat } from "@/lib/geminiClient";
import { z } from "zod";

export const dynamic = "force-dynamic";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RebalanceTrade {
  ticker: string;
  action: "BUY" | "SELL" | "HOLD";
  currentWeight: number;     // %
  targetWeight: number;      // %
  deltaWeight: number;       // target - current, in %
  estimatedUsd: number;      // dollars to trade (based on total portfolio value)
  harvestOpportunity: boolean; // selling at a loss → potential tax benefit
  harvestNote?: string;
}

export interface RebalanceResult {
  trades: RebalanceTrade[];
  totalPortfolioValue: number;
  currentMetrics: { return: number; volatility: number; sharpe: number };
  targetMetrics:  { return: number; volatility: number; sharpe: number };
  model: "black-litterman" | "markowitz";
  viewsUsed: number;
  rebalancedAt: string;
}

// ── Gemini view generation (reused from optimize route pattern) ───────────────

const ViewSchema = z.object({
  ticker: z.string(),
  expectedAnnualReturn: z.number().min(-1).max(5),
  confidence: z.number().min(0).max(1),
});

const ViewsSchema = z.object({ views: z.array(ViewSchema).max(20) });

async function generateViews(
  tickers: string[],
  macroSummary: string
): Promise<BlackLittermanView[]> {
  const prompt = `Para cada ticker, genera una vista de retorno anual esperado basada en fundamentos y contexto macro.

Tickers: ${tickers.join(", ")}
Contexto macro: ${macroSummary}

JSON exacto:
{
  "views": [
    { "ticker": "XXXX", "expectedAnnualReturn": 0.10, "confidence": 0.65 }
  ]
}

expectedAnnualReturn: decimal (0.10 = +10%). Rango realista: -0.40 a +0.60.
confidence: 0-1 (0.8 = alta, 0.3 = baja).
Una vista por ticker. Si hay dudas, usa 0.07 con confidence 0.3.`;

  try {
    const raw = await geminiChat(prompt, 500, 2, {
      systemInstruction:
        "Motor de inferencia cuantitativa. Responde solo con JSON válido. " +
        "Proyecciones algorítmicas informativas, no asesoramiento financiero.",
      jsonMode: true,
      temperature: 0.1,
    });
    const parsed = ViewsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    return parsed.data.views.filter((v) => tickers.includes(v.ticker));
  } catch {
    return [];
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const stocks = await getStocksWithAnalysis(session.user.id);
  const withAnalysis = stocks.filter((s) => s.analysis && s.analysis.price > 0);

  if (withAnalysis.length < 2) {
    return NextResponse.json(
      { error: "Se necesitan al menos 2 acciones con análisis para calcular el rebalanceo." },
      { status: 400 }
    );
  }

  // Fetch market data + macro in parallel
  const [historicalResults, macroContext] = await Promise.all([
    Promise.allSettled(withAnalysis.map((s) => getHistoricalCloses(s.ticker, 60))),
    getGlobalContext().catch(() => null),
  ]);

  const historicalData: Record<string, number[]> = {};
  const currentValues: Record<string, number> = {};

  historicalResults.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.closes.length >= 10) {
      const s = withAnalysis[i];
      historicalData[s.ticker] = r.value.closes;
      currentValues[s.ticker] = (s.analysis?.price ?? 0) * (s.quantity ?? 1);
    }
  });

  const tickers = Object.keys(historicalData);
  if (tickers.length < 2) {
    return NextResponse.json({ error: "Datos históricos insuficientes." }, { status: 400 });
  }

  // Generate BL views from Gemini
  const macroSummary =
    macroContext && macroContext.items.length > 0
      ? macroContext.items.map((i) => `[${i.impactLevel}] ${i.title}`).join("; ")
      : "Sin contexto macro disponible.";

  const views = await generateViews(tickers, macroSummary);
  const optimization = views.length > 0
    ? runBlackLitterman(historicalData, currentValues, views)
    : runPortfolioOptimization(historicalData, currentValues);

  const model: "black-litterman" | "markowitz" = views.length > 0 ? "black-litterman" : "markowitz";

  // Total portfolio value
  const totalValue = Object.values(currentValues).reduce((s, v) => s + v, 0);

  // Build current weight map
  const currentWeightMap: Record<string, number> = {};
  tickers.forEach((t) => {
    currentWeightMap[t] = totalValue > 0
      ? parseFloat(((currentValues[t] / totalValue) * 100).toFixed(2))
      : parseFloat((100 / tickers.length).toFixed(2));
  });

  // Build target weight map from optimization
  const targetWeightMap: Record<string, number> = {};
  optimization.tickers.forEach((t, i) => {
    targetWeightMap[t] = parseFloat((optimization.optimalWeights[i] * 100).toFixed(2));
  });

  // Tax harvesting opportunities for positions we're reducing/selling
  const harvestAlerts = detectHarvestOpportunities(
    withAnalysis.map((s) => ({
      ticker: s.ticker,
      purchasePrice: s.purchasePrice ?? null,
      currentPrice: s.analysis?.price ?? 0,
      quantity: s.quantity ?? null,
    }))
  );
  const harvestSet = new Set(harvestAlerts.map((h) => h.ticker));

  // Compute trades — only emit BUY/SELL when delta > 0.5% (avoid noise)
  const MIN_DELTA_PCT = 0.5;
  const trades: RebalanceTrade[] = tickers
    .map((ticker) => {
      const currentWeight = currentWeightMap[ticker] ?? 0;
      const targetWeight = targetWeightMap[ticker] ?? 0;
      const deltaWeight = parseFloat((targetWeight - currentWeight).toFixed(2));
      const estimatedUsd = parseFloat(((Math.abs(deltaWeight) / 100) * totalValue).toFixed(2));

      let action: "BUY" | "SELL" | "HOLD" = "HOLD";
      if (Math.abs(deltaWeight) >= MIN_DELTA_PCT) {
        action = deltaWeight > 0 ? "BUY" : "SELL";
      }

      const isHarvestOpp = action === "SELL" && harvestSet.has(ticker);
      const harvestAlert = isHarvestOpp
        ? harvestAlerts.find((h) => h.ticker === ticker)
        : undefined;
      const harvestNote = harvestAlert
        ? harvestAlert.alternative
            ? `Pérdida latente — considera rotación a ${harvestAlert.alternative}`
            : "Pérdida latente — posible cosecha fiscal"
        : undefined;

      return {
        ticker,
        action,
        currentWeight,
        targetWeight,
        deltaWeight,
        estimatedUsd,
        harvestOpportunity: isHarvestOpp,
        ...(harvestNote ? { harvestNote } : {}),
      };
    })
    .sort((a, b) => Math.abs(b.deltaWeight) - Math.abs(a.deltaWeight));

  const result: RebalanceResult = {
    trades,
    totalPortfolioValue: parseFloat(totalValue.toFixed(2)),
    currentMetrics: {
      return: parseFloat((optimization.currentReturn * 100).toFixed(2)),
      volatility: parseFloat((optimization.currentVol * 100).toFixed(2)),
      sharpe: parseFloat(optimization.currentSharpe.toFixed(3)),
    },
    targetMetrics: {
      return: parseFloat((optimization.optimalReturn * 100).toFixed(2)),
      volatility: parseFloat((optimization.optimalVol * 100).toFixed(2)),
      sharpe: parseFloat(optimization.optimalSharpe.toFixed(3)),
    },
    model,
    viewsUsed: views.length,
    rebalancedAt: new Date().toISOString(),
  };

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
