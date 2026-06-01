import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { executeSell } from "@/services/portfolioService";

export const dynamic = "force-dynamic";

/**
 * POST /api/portfolio/sell
 *
 * Body: { stockId: string, shares: number, price: number }
 *
 * Records a sell transaction, updates or closes the position, and returns
 * the closed-operation record plus updated position state.
 *
 * HTTP codes:
 *   201 — sell executed successfully
 *   400 — invalid input or insufficient shares
 *   401 — unauthenticated
 *   404 — stock not found / not owned by user
 *   500 — unexpected server error
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const { stockId, shares, price } =
    (body as { stockId?: unknown; shares?: unknown; price?: unknown }) ?? {};

  if (typeof stockId !== "string" || !stockId.trim()) {
    return NextResponse.json({ error: "El campo stockId es obligatorio" }, { status: 400 });
  }
  if (typeof shares !== "number" || shares <= 0 || !isFinite(shares)) {
    return NextResponse.json(
      { error: "El campo shares debe ser un número positivo" },
      { status: 400 }
    );
  }
  if (typeof price !== "number" || price <= 0 || !isFinite(price)) {
    return NextResponse.json(
      { error: "El campo price debe ser un número positivo" },
      { status: 400 }
    );
  }

  try {
    const result = await executeSell(session.user.id, stockId.trim(), shares, price);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno del servidor";

    if (
      message.includes("Acciones insuficientes") ||
      message.includes("mayor que cero") ||
      message.includes("precio de compra registrado")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes("no encontrada") || message.includes("no pertenece")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    console.error("[sell] Unexpected error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
