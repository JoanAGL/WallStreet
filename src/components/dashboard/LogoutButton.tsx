"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
    >
      Cerrar sesión
    </button>
  );
}
