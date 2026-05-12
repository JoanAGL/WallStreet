import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { removeUserStock, updateUserStockHorizon } from "@/services/stockService";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.investmentHorizon !== "string") {
    return NextResponse.json({ error: "Campo investmentHorizon requerido." }, { status: 400 });
  }

  const result = await updateUserStockHorizon(params.ticker, session.user.id, body.investmentHorizon);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
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
