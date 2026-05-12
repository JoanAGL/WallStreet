import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  removeUserStock,
  updateUserStockHorizon,
  updateUserStockPurchaseData,
} from "@/services/stockService";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  // Horizon update
  if ("investmentHorizon" in body) {
    if (typeof body.investmentHorizon !== "string") {
      return NextResponse.json({ error: "Campo investmentHorizon inválido." }, { status: 400 });
    }
    const result = await updateUserStockHorizon(params.ticker, session.user.id, body.investmentHorizon);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  }

  // Purchase data update
  if ("purchasePrice" in body || "quantity" in body || "purchaseDate" in body) {
    const purchasePrice =
      body.purchasePrice != null ? Number(body.purchasePrice) : null;
    const quantity =
      body.quantity != null ? Number(body.quantity) : null;
    const purchaseDate =
      typeof body.purchaseDate === "string" && body.purchaseDate
        ? new Date(body.purchaseDate)
        : null;

    if (purchasePrice !== null && isNaN(purchasePrice)) {
      return NextResponse.json({ error: "Precio de compra inválido." }, { status: 400 });
    }
    if (quantity !== null && (isNaN(quantity) || quantity <= 0)) {
      return NextResponse.json({ error: "Cantidad inválida." }, { status: 400 });
    }

    const result = await updateUserStockPurchaseData(params.ticker, session.user.id, {
      purchasePrice,
      quantity,
      purchaseDate,
    });
    if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  }

  return NextResponse.json({ error: "Sin campos válidos para actualizar." }, { status: 400 });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const result = await removeUserStock(params.ticker, session.user.id);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return new NextResponse(null, { status: 204 });
}
