import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { addTransaction, getStockMetrics } from "@/services/transactionService";

export const dynamic = "force-dynamic";

/**
 * GET /api/portfolio/transactions?stockId=xxx&currentPrice=yyy
 * Returns position metrics + transaction history for one stock.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const stockId      = searchParams.get("stockId");
  const priceParam   = searchParams.get("currentPrice");
  const currentPrice = priceParam ? parseFloat(priceParam) : null;

  if (!stockId) {
    return NextResponse.json({ error: "stockId es obligatorio" }, { status: 400 });
  }

  try {
    const metrics = await getStockMetrics(
      session.user.id,
      stockId,
      currentPrice && isFinite(currentPrice) ? currentPrice : null
    );
    return NextResponse.json(metrics);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    if (msg.includes("no encontrada")) return NextResponse.json({ error: msg }, { status: 404 });
    console.error("[transactions GET]", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * POST /api/portfolio/transactions
 * Body: { stockId, type: "BUY"|"SELL"|"SPLIT"|"DIVIDEND", shares, price, fee?, date?, notes? }
 * - SPLIT: `shares` es el factor (10 → split 10:1, 0.1 → contrasplit 1:10);
 *   `price` se ignora (se almacena 1).
 * - DIVIDEND: `shares` × `price` = importe bruto; `fee` = retención.
 * - BUY/SELL: `fee` = comisión de la operación (opcional, USD).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const { stockId, type, shares, price, fee, date, notes } =
    (body as Record<string, unknown>) ?? {};

  if (typeof stockId !== "string" || !stockId.trim())
    return NextResponse.json({ error: "stockId es obligatorio" }, { status: 400 });
  if (type !== "BUY" && type !== "SELL" && type !== "SPLIT" && type !== "DIVIDEND")
    return NextResponse.json({ error: "type debe ser BUY, SELL, SPLIT o DIVIDEND" }, { status: 400 });
  if (typeof shares !== "number" || shares <= 0 || !isFinite(shares))
    return NextResponse.json({ error: "shares debe ser un número positivo" }, { status: 400 });
  if (type !== "SPLIT" && (typeof price !== "number" || price <= 0 || !isFinite(price)))
    return NextResponse.json({ error: "price debe ser un número positivo" }, { status: 400 });
  if (fee !== undefined && (typeof fee !== "number" || fee < 0 || !isFinite(fee)))
    return NextResponse.json({ error: "fee debe ser un número ≥ 0" }, { status: 400 });

  const parsedDate = typeof date === "string" && date ? new Date(date) : null;
  const parsedNotes = typeof notes === "string" && notes.trim() ? notes.trim() : null;

  try {
    const tx = await addTransaction(
      session.user.id, stockId.trim(), type, shares,
      type === "SPLIT" ? 1 : (price as number),
      parsedDate, parsedNotes,
      typeof fee === "number" ? fee : undefined
    );
    return NextResponse.json(tx, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    if (msg.includes("insuficientes") || msg.includes("positivo"))
      return NextResponse.json({ error: msg }, { status: 400 });
    if (msg.includes("no encontrada"))
      return NextResponse.json({ error: msg }, { status: 404 });
    console.error("[transactions POST]", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
