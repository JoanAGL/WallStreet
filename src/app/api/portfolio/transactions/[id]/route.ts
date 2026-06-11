import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteUserTransaction, editUserTransaction } from "@/services/transactionService";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/portfolio/transactions/[id]
 * Body: { type?, shares?, price?, fee?, date?, notes? }
 * Updates a transaction owned by the authenticated user.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const { type, shares, price, fee, date, notes } = (body as Record<string, unknown>) ?? {};

  if (type !== undefined && type !== "BUY" && type !== "SELL" && type !== "SPLIT" && type !== "DIVIDEND")
    return NextResponse.json({ error: "type debe ser BUY, SELL, SPLIT o DIVIDEND" }, { status: 400 });
  if (shares !== undefined && (typeof shares !== "number" || shares <= 0 || !isFinite(shares)))
    return NextResponse.json({ error: "shares debe ser un número positivo" }, { status: 400 });
  if (price !== undefined && (typeof price !== "number" || price <= 0 || !isFinite(price)))
    return NextResponse.json({ error: "price debe ser un número positivo" }, { status: 400 });
  if (fee !== undefined && (typeof fee !== "number" || fee < 0 || !isFinite(fee)))
    return NextResponse.json({ error: "fee debe ser un número ≥ 0" }, { status: 400 });

  const parsedDate  = typeof date  === "string" && date  ? new Date(date)  : date  === null ? null : undefined;
  const parsedNotes = typeof notes === "string"          ? notes.trim() || null : notes === null ? null : undefined;

  try {
    const tx = await editUserTransaction(session.user.id, params.id, {
      type:  type  as "BUY" | "SELL" | "SPLIT" | "DIVIDEND" | undefined,
      shares: shares as number | undefined,
      price:  price  as number | undefined,
      fee:    fee    as number | undefined,
      date:   parsedDate,
      notes:  parsedNotes,
    });
    return NextResponse.json(tx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    if (msg.includes("insuficientes") || msg.includes("positivo"))
      return NextResponse.json({ error: msg }, { status: 400 });
    if (msg.includes("no encontrada"))
      return NextResponse.json({ error: msg }, { status: 404 });
    console.error("[transactions PATCH]", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * DELETE /api/portfolio/transactions/[id]
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
