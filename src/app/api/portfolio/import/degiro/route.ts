import { getServerSession } from "next-auth";
import { NextResponse }     from "next/server";
import { authOptions }      from "@/lib/auth";
import { importDegiroCSV }  from "@/services/importService";

export const runtime = "nodejs";
// Large files + Yahoo Finance calls can take a while
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Se esperaba FormData con un campo 'file'." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "Campo 'file' requerido." }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".csv"))
    return NextResponse.json({ error: "El archivo debe ser un CSV de DEGIRO." }, { status: 400 });
  if (file.size > 10 * 1024 * 1024)
    return NextResponse.json({ error: "El archivo supera el límite de 10 MB." }, { status: 400 });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importDegiroCSV(buffer, session.user.id);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido al importar.";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
