import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStocksWithAnalysis } from "@/repositories/stockRepository";
import { getHistoricalCloses } from "@/services/marketDataService";
import { runBlackLitterman, runPortfolioOptimization } from "@/lib/math/optimization/blackLitterman";
import type { BlackLittermanView } from "@/lib/math/optimization/blackLitterman";
import { getGlobalContext } from "@/services/macroService";
import { geminiChat } from "@/lib/geminiClient";
import { z } from "zod";

export const dynamic = "force-dynamic";

// ── Zod schema for Gemini views response ──────────────────────────────────────

const ViewSchema = z.object({
  ticker: z.string(),
  expectedAnnualReturn: z.number().min(-1).max(5),
  confidence: z.number().min(0).max(1),
});

const ViewsResponseSchema = z.object({
  views: z.array(ViewSchema).max(20),
});

// ── Gemini view generation ────────────────────────────────────────────────────

async function generateViews(
  tickers: string[],
  macroSummary: string
): Promise<BlackLittermanView[]> {
  const prompt = `Eres un analista cuantitativo. Para cada ticker de la lista, genera una vista de retorno anual esperado basada en fundamentos, tendencia técnica y el contexto macro.

Tickers: ${tickers.join(", ")}
Contexto macroeconómico actual: ${macroSummary}

Responde ÚNICAMENTE con este JSON (sin markdown):
{
  "views": [
    {
      "ticker": "XXXX",
      "expectedAnnualReturn": 0.12,
      "confidence": 0.65
    }
  ]
}

Reglas:
- expectedAnnualReturn: retorno anual esperado como decimal (0.12 = +12%, -0.05 = -5%). Rango realista: -0.40 a +0.60.
- confidence: nivel de convicción 0-1 (0.8 = alta convicción, 0.3 = baja).
- Genera exactamente una vista por ticker.
- Si no tienes datos suficientes para un ticker, usa expectedAnnualReturn=0.07 y confidence=0.3.`;

  try {
    const raw = await geminiChat(prompt, 600, 2, {
      systemInstruction:
        "Eres un motor de inferencia cuantitativa. Responde solo con JSON válido. " +
        "Las vistas son proyecciones algorítmicas informativas, no asesoramiento financiero.",
      jsonMode: true,
      temperature: 0.1,
    });

    const parsed = ViewsResponseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn("[optimize] Gemini views failed Zod validation:", parsed.error.flatten());
      return [];
    }

    return parsed.data.views.filter((v) => tickers.includes(v.ticker));
  } catch (err) {
    console.warn("[optimize] Gemini views generation failed:", err);
    return [];
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const stocks = await getStocksWithAnalysis(session.user.id);
  const withAnalysis = stocks.filter((s) => s.analysis);
  if (withAnalysis.length < 2) {
    return NextResponse.json(
      { error: "Se necesitan al menos 2 acciones con análisis." },
      { status: 400 }
    );
  }

  const historicalResults = await Promise.allSettled(
    withAnalysis.map((s) => getHistoricalCloses(s.ticker, 60))
  );

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

  // Fetch macro context + Gemini views in parallel (both cached — low latency on cache hit)
  const [macroContext, views] = await Promise.allSettled([
    getGlobalContext(),
    (async () => {
      const macro = await getGlobalContext().catch(() => null);
      const macroSummary = macro && macro.items.length > 0
        ? macro.items.map((i) => `[${i.impactLevel}] ${i.title}`).join("; ")
        : "No macro context available.";
      return generateViews(tickers, macroSummary);
    })(),
  ]);

  const resolvedViews: BlackLittermanView[] =
    views.status === "fulfilled" ? views.value : [];

  // Black-Litterman if Gemini provided views; fallback to Markowitz
  const result =
    resolvedViews.length > 0
      ? runBlackLitterman(historicalData, currentValues, resolvedViews)
      : runPortfolioOptimization(historicalData, currentValues);

  const meta = {
    model: resolvedViews.length > 0 ? "black-litterman" : "markowitz",
    viewsUsed: resolvedViews.length,
    macroContextAvailable: macroContext.status === "fulfilled" && macroContext.value.items.length > 0,
  };

  return NextResponse.json(
    { ...result, meta },
    { headers: { "Cache-Control": "no-store" } }
  );
}
