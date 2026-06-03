import { getServerSession } from "next-auth";
import { NextResponse }     from "next/server";
import { authOptions }      from "@/lib/auth";
import { prisma }           from "@/lib/prisma";

/**
 * DELETE /api/portfolio/reset
 * Wipes all portfolio data for the authenticated user (stocks, transactions,
 * analysis snapshots, manual sells, portfolio AI analysis) without deleting
 * the account itself.
 */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const userId = session.user.id;

  // Order matters: delete children before parents where cascade isn't set,
  // but Prisma schema has onDelete: Cascade on all Stock children,
  // so deleting stocks is sufficient for Transactions, StockAnalysis, etc.
  await prisma.$transaction([
    prisma.manualSellEntry.deleteMany({ where: { userId } }),
    prisma.portfolioAnalysis.deleteMany({ where: { userId } }),
    // Deleting stocks cascades: Transaction, StockAnalysis,
    // StockAnalysisHistory, ClosedOperation
    prisma.stock.deleteMany({ where: { userId } }),
  ]);

  return NextResponse.json({ ok: true });
}
