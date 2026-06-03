import { getServerSession }       from "next-auth";
import { NextResponse }            from "next/server";
import { authOptions }             from "@/lib/auth";
import { getDecisionAnalysis }     from "@/services/decisionAnalysisService";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  try {
    const analysis = await getDecisionAnalysis(session.user.id);
    return NextResponse.json(analysis);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al calcular insights.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
