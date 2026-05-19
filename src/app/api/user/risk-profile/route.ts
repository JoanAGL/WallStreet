import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.userProfile.findUnique({
    where: { userId: session.user.id },
  });

  return NextResponse.json(profile ?? null);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { answers } = body as { answers: Record<string, number> };

  if (!answers || typeof answers !== "object") {
    return NextResponse.json({ error: "Invalid answers" }, { status: 400 });
  }

  const riskScore = Object.values(answers).reduce((sum, v) => sum + v, 0);
  const riskLabel =
    riskScore <= 12 ? "Conservador" :
    riskScore <= 24 ? "Moderado"    : "Agresivo";

  const profile = await prisma.userProfile.upsert({
    where:  { userId: session.user.id },
    update: { riskScore, riskLabel, answers: JSON.stringify(answers) },
    create: { userId: session.user.id, riskScore, riskLabel, answers: JSON.stringify(answers) },
  });

  return NextResponse.json(profile);
}
