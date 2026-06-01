import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getClosedPerformance } from "@/services/portfolioService";

export const dynamic = "force-dynamic";

/**
 * GET /api/portfolio/history
 *
 * Returns all closed (sold) operations for the authenticated user plus
 * portfolio-level profit aggregates.
 *
 * Response shape:
 * {
 *   operations:        ClosedOperationRecord[]   // newest first
 *   totalInvested:     number                    // Σ investedAmount (USD)
 *   totalRevenue:      number                    // Σ revenueAmount (USD)
 *   totalProfitAmount: number                    // totalRevenue - totalInvested (USD)
 *   totalProfitPct:    number                    // (totalProfitAmount / totalInvested) * 100
 * }
 *
 * HTTP codes:
 *   200 — success (empty operations array if no sells yet)
 *   401 — unauthenticated
 *   500 — unexpected server error
 */
export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const performance = await getClosedPerformance(session.user.id);
    return NextResponse.json(performance);
  } catch (err) {
    console.error("[history] Unexpected error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
