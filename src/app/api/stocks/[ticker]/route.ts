import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { removeUserStock } from "@/services/stockService";

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
