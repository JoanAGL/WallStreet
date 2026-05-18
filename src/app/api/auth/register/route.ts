import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { findUserByEmail, createUser } from "@/repositories/userRepository";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name } = body as {
      email?: string;
      password?: string;
      name?: string;
    };

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email y contraseña son obligatorios" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres" },
        { status: 400 }
      );
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "El email ya está registrado" },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await createUser({ email, password: hashedPassword, name });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error("[REGISTER]", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
