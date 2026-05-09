import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WallStreet – Análisis Bursátil Informativo",
  description:
    "Plataforma académica y profesional de análisis bursátil informativo con IA. Solo con fines informativos, no constituye asesoramiento financiero.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
