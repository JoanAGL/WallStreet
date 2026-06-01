import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteUserTransaction } from "@/services/transactionService";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/portfolio/transactions/[id]
 * Deletes a transaction owned by the authenticated user.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    await deleteUserTransaction(session.user.id, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    if (msg.includes("no encontrada"))
      return NextResponse.json({ error: msg }, { status: 404 });
    console.error("[transactions DELETE]", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
