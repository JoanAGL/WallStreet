import { getServerSession } from "next-auth";
import { NextResponse }     from "next/server";
import { authOptions }      from "@/lib/auth";
import { createManualSell } from "@/repositories/manualSellRepository";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }

  const { ticker, shares, avgBuyPrice, sellPrice, date, notes } = body as Record<string, unknown>;

  if (!ticker || typeof ticker !== "string" || !ticker.trim())
    return NextResponse.json({ error: "El ticker es obligatorio." }, { status: 400 });
  if (!isFinite(Number(shares)) || Number(shares) <= 0)
    return NextResponse.json({ error: "Las acciones deben ser un número positivo." }, { status: 400 });
  if (!isFinite(Number(avgBuyPrice)) || Number(avgBuyPrice) <= 0)
    return NextResponse.json({ error: "El precio medio de compra debe ser positivo." }, { status: 400 });
  if (!isFinite(Number(sellPrice)) || Number(sellPrice) <= 0)
    return NextResponse.json({ error: "El precio de venta debe ser positivo." }, { status: 400 });

  const parsedDate = date ? new Date(date as string) : null;
  if (parsedDate && isNaN(parsedDate.getTime()))
    return NextResponse.json({ error: "Fecha inválida." }, { status: 400 });

  try {
    const entry = await createManualSell({
      userId:      session.user.id,
      ticker:      String(ticker),
      shares:      Number(shares),
      avgBuyPrice: Number(avgBuyPrice),
      sellPrice:   Number(sellPrice),
      date:        parsedDate,
      notes:       typeof notes === "string" && notes.trim() ? notes.trim() : null,
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (e) {
    console.error("[manual-sell] POST error:", e);
    return NextResponse.json({ error: "Error al guardar la entrada." }, { status: 500 });
  }
}
