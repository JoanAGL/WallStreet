import { getServerSession }                          from "next-auth";
import { NextResponse }                              from "next/server";
import { authOptions }                               from "@/lib/auth";
import { findManualSellByIdAndUser, deleteManualSell } from "@/repositories/manualSellRepository";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const entry = await findManualSellByIdAndUser(params.id, session.user.id);
  if (!entry) return NextResponse.json({ error: "Entrada no encontrada." }, { status: 404 });

  await deleteManualSell(params.id);
  return NextResponse.json({ ok: true });
}
