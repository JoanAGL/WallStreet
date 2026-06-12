// WARNING: With 20 stocks per user and multiple users, this route can run for
// several minutes. Requires Vercel Pro (300s max duration) or higher.
// On Vercel Hobby (10s limit) this will time out with more than ~2 stocks total.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAnalysisForStocks } from "@/services/analysisOrchestrator";
import { isCronAuthorized, unauthorizedResponse } from "@/lib/cronAuth";
import { capturePortfolioSnapshot } from "@/services/portfolioSnapshotService";

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return unauthorizedResponse();

  try {
    // Obtiene todas las acciones activas de todos los usuarios
    const stocks = await prisma.stock.findMany({
      select: { id: true, ticker: true },
    });

    if (stocks.length === 0) {
      return NextResponse.json({ message: "Sin acciones que procesar", processed: 0 });
    }

    const results = await runAnalysisForStocks(stocks);

    // Snapshot diario por usuario (equity curve / TWR)
    const userIds = await prisma.stock.findMany({
      select: { userId: true }, distinct: ["userId"],
    });
    await Promise.allSettled(
      userIds.map(({ userId }) =>
        capturePortfolioSnapshot(userId).catch((e) =>
          console.warn(`[CRON] Snapshot falló para ${userId}:`, e)
        )
      )
    );

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success);

    return NextResponse.json({
      message: "Actualización diaria completada",
      processed: stocks.length,
      succeeded,
      failed: failed.map((f) => ({ ticker: f.ticker, error: f.error })),
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON] Error en actualización diaria:", error);
    return NextResponse.json(
      { error: "Error interno en el cron job" },
      { status: 500 }
    );
  }
}
