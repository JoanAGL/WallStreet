import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGlobalContext } from "@/services/macroService";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const context = await getGlobalContext();
    return NextResponse.json(context);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/macro/flash]", message);
    return NextResponse.json({ error: "Error al obtener contexto macroeconómico." }, { status: 500 });
  }
}
