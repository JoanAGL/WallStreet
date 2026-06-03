import { getServerSession } from "next-auth";
import { NextResponse }     from "next/server";
import { authOptions }      from "@/lib/auth";
import { prisma }           from "@/lib/prisma";

/**
 * DELETE /api/portfolio/reset
 * Wipes all portfolio data (stocks, transactions, analysis, manual sells,
 * portfolio AI) without deleting the user account.
 * Stock deletion cascades to: Transaction, StockAnalysis,
 * StockAnalysisHistory, ClosedOperation.
 */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const userId = session.user.id;
  await prisma.$transaction([
    prisma.manualSellEntry.deleteMany({ where: { userId } }),
    prisma.portfolioAnalysis.deleteMany({ where: { userId } }),
    prisma.stock.deleteMany({ where: { userId } }),
  ]);

  return NextResponse.json({ ok: true });
}
