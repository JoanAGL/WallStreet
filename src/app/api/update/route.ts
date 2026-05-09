import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStocksByUser } from "@/repositories/stockRepository";
import { getAnalysesForUser } from "@/repositories/analysisRepository";
import { runAnalysisForStocks } from "@/services/analysisOrchestrator";

// Intervalo mínimo entre actualizaciones manuales: 5 minutos
const RATE_LIMIT_MS = 5 * 60 * 1000;

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;

  // Rate limiting: verifica el análisis más reciente del usuario
  const existingAnalyses = await getAnalysesForUser(userId);
  if (existingAnalyses.length > 0) {
    const mostRecent = existingAnalyses.reduce((latest, a) =>
      a.updatedAt > latest.updatedAt ? a : latest
    );
    const elapsed = Date.now() - mostRecent.updatedAt.getTime();
    if (elapsed < RATE_LIMIT_MS) {
      const waitSecs = Math.ceil((RATE_LIMIT_MS - elapsed) / 1000);
      return NextResponse.json(
        {
          error: `Demasiadas actualizaciones. Espera ${waitSecs} segundos.`,
          retryAfterSeconds: waitSecs,
        },
        { status: 429 }
      );
    }
  }

  const stocks = await getStocksByUser(userId);
  if (stocks.length === 0) {
    return NextResponse.json(
      { error: "No tienes acciones añadidas." },
      { status: 400 }
    );
  }

  const results = await runAnalysisForStocks(
    stocks.map((s) => ({ id: s.id, ticker: s.ticker }))
  );

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success);

  return NextResponse.json({
    message: "Actualización completada",
    succeeded,
    failed: failed.map((f) => ({ ticker: f.ticker, error: f.error })),
    updatedAt: new Date().toISOString(),
  });
}
