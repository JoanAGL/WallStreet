import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import SessionProvider from "@/components/providers/SessionProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "My Personal Advisor – Análisis Bursátil Informativo",
  description:
    "Plataforma académica y profesional de análisis bursátil informativo con IA. Solo con fines informativos, no constituye asesoramiento financiero.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="es">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
