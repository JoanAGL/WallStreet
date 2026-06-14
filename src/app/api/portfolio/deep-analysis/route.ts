import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStocksWithAnalysis } from "@/repositories/stockRepository";
import { getPortfolioMetrics } from "@/services/transactionService";
import { prisma } from "@/lib/prisma";
import { geminiChat } from "@/lib/geminiClient";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const userId = session.user.id;

  const [stocks, analyses, userProfile] = await Promise.all([
    getStocksWithAnalysis(userId),
    prisma.stockAnalysis.findMany({
      where:  { stock: { userId } },
      select: { stockId: true, price: true },
    }),
    prisma.userProfile.findUnique({ where: { userId }, select: { riskLabel: true } }),
  ]);

  const openStocks = stocks.filter((s) => s.quantity != null && s.quantity > 0 && s.analysis);
  if (openStocks.length < 1) {
    return NextResponse.json({ error: "No hay posiciones abiertas con análisis." }, { status: 400 });
  }

  const currentPrices: Record<string, number> = {};
  for (const a of analyses) currentPrices[a.stockId] = a.price;

  const metrics = await getPortfolioMetrics(userId, currentPrices);

  const totalCost  = metrics.totalCostBasis;
  const totalValue = metrics.totalCurrentValue;
  const unrealPnL  = metrics.totalUnrealizedPnL ?? 0;
  const realPnL    = metrics.totalRealizedPnL;
  const totalPnl   = unrealPnL + realPnL;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : null;

  // CAGR from earliest transaction date
  const allDates = metrics.positions
    .flatMap((p) => p.transactions.map((t) => t.date ?? t.createdAt))
    .filter(Boolean) as Date[];
  const earliestDate = allDates.length > 0
    ? allDates.reduce((a, b) => (a < b ? a : b))
    : null;
  const yearsHeld = earliestDate
    ? (Date.now() - earliestDate.getTime()) / (365.25 * 24 * 3600 * 1000)
    : null;
  const cagr =
    yearsHeld != null && yearsHeld > 0.05 && totalCost > 0 && totalValue > 0
      ? (Math.pow(totalValue / totalCost, 1 / yearsHeld) - 1) * 100
      : null;

  // Top positions by weight
  const positionsByValue = [...metrics.positions]
    .filter((p) => p.currentValue != null)
    .sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0));
  const top3Weight = positionsByValue
    .slice(0, 3)
    .reduce((sum, p) => sum + (p.portfolioWeightPct ?? 0), 0);

  // Worst performers
  const worstPerformers = [...metrics.positions]
    .filter((p) => p.unrealizedPnLPct != null)
    .sort((a, b) => (a.unrealizedPnLPct ?? 0) - (b.unrealizedPnLPct ?? 0))
    .slice(0, 3);

  // Analysis text per stock
  const stockLines = openStocks
    .map((s) => {
      const pos = metrics.positions.find((p) => p.stockId === s.id);
      const a   = s.analysis!;
      return [
        `• ${s.ticker} — Precio: $${a.price.toFixed(2)} (${a.changePercent >= 0 ? "+" : ""}${a.changePercent.toFixed(2)}% hoy)`,
        `  Escenario: ${a.scenarioLabel} | RSI14: ${a.rsi14?.toFixed(1) ?? "N/D"} | Sentimiento: ${a.newsSentiment}`,
        pos && pos.unrealizedPnL != null
          ? `  P&L no realiz.: ${pos.unrealizedPnL >= 0 ? "+" : ""}$${pos.unrealizedPnL.toFixed(2)} (${pos.unrealizedPnLPct?.toFixed(2) ?? "?"}%) | Peso: ${pos.portfolioWeightPct?.toFixed(1) ?? "?"}%`
          : null,
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");

  const prompt = `Eres un asesor de carteras institucional. Analiza la siguiente cartera de inversión en español. Sé conciso, directo y técnico. Responde en texto libre (no JSON) con secciones claras usando headers como **Sección:**.

RESUMEN DE CARTERA:
- Valor actual: $${totalValue.toFixed(2)}
- Coste base total: $${totalCost.toFixed(2)}
- P&L no realizado: ${unrealPnL >= 0 ? "+" : ""}$${unrealPnL.toFixed(2)}
- P&L realizado: ${realPnL >= 0 ? "+" : ""}$${realPnL.toFixed(2)}
- P&L total: ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)} (${totalPnlPct != null ? (totalPnlPct >= 0 ? "+" : "") + totalPnlPct.toFixed(2) + "%" : "N/D"})
${cagr != null ? `- CAGR anualizado: ${cagr >= 0 ? "+" : ""}${cagr.toFixed(2)}% (desde ${earliestDate!.toLocaleDateString("es-ES")})` : ""}
- Perfil de riesgo: ${userProfile?.riskLabel ?? "No definido"}
- Posiciones: ${openStocks.length}
- Top 3 concentración: ${top3Weight.toFixed(1)}% del portfolio
- Peores performers: ${worstPerformers.map((p) => `${p.ticker} (${p.unrealizedPnLPct?.toFixed(1) ?? "?"}%)`).join(", ")}

POSICIONES ABIERTAS:
${stockLines}

Escribe un análisis estructurado con estas secciones:
**Estado de la cartera:** Resumen ejecutivo del P&L, CAGR y posición general (2-3 oraciones).
**Riesgo y concentración:** Evalúa la concentración top-3, diversificación sectorial y perfil de riesgo agregado.
**Activos con peor rendimiento:** Analiza los peores performers y si hay señales de recuperación o deterioro.
**Tax Harvesting:** Identifica posiciones con pérdidas latentes que podrían usarse para compensar ganancias fiscalmente.
**Recomendaciones:** 2-3 acciones concretas de rebalanceo o gestión de riesgo basadas en los datos (sin recomendaciones específicas de compra/venta de activos no mencionados).

Nota legal: Este análisis es puramente informativo y no constituye asesoramiento financiero personalizado.`;

  const text = await geminiChat(prompt, 1500, 2, {
    systemInstruction: "Eres un asesor cuantitativo de carteras. Responde en español, en texto libre con headers **Sección:**. Sin JSON. Sin recomendaciones de compra/venta fuera del contexto de la cartera del usuario.",
    temperature: 0.3,
  });

  return NextResponse.json({ analysis: text, generatedAt: new Date().toISOString() });
}
