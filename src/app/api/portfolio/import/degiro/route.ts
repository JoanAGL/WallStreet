import { getServerSession } from "next-auth";
import { NextResponse }     from "next/server";
import { authOptions }      from "@/lib/auth";
import { importDegiroCSV }  from "@/services/importService";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Request inválido: se esperaba FormData." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Campo 'file' requerido." }, { status: 400 });
  }

  if (!file.name.endsWith(".csv")) {
    return NextResponse.json({ error: "El archivo debe ser un CSV exportado de DEGIRO." }, { status: 400 });
  }

  const MAX_MB = 10;
  if (file.size > MAX_MB * 1024 * 1024) {
    return NextResponse.json({ error: `El archivo supera el límite de ${MAX_MB} MB.` }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importDegiroCSV(buffer, session.user.id);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido al importar.";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
