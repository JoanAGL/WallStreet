import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutButton from "@/components/dashboard/LogoutButton";
import RiskProfileBadge from "@/components/dashboard/RiskProfileBadge";
import { prisma } from "@/lib/prisma";

function NavLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`text-sm text-slate-300 hover:text-white transition-colors px-1 ${className}`}
    >
      {children}
    </Link>
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const userProfile = await prisma.userProfile.findUnique({
    where: { userId: session.user.id },
    select: { riskLabel: true },
  });

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      {/* ── Dark header — MyInvestor style ── */}
      <header className="sticky top-0 z-10" style={{ background: "var(--header-bg)", borderBottom: "1px solid var(--header-border)" }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Brand */}
          <Link href="/dashboard" className="font-bold text-white tracking-tight hover:text-gray-200 transition-colors">
            My Personal Advisor
          </Link>

          {/* Nav */}
          <div className="flex items-center gap-1 sm:gap-3">
            <span className="text-sm text-slate-400 hidden md:inline px-1">
              {session.user.name ?? session.user.email}
            </span>

            <RiskProfileBadge riskLabel={userProfile?.riskLabel ?? null} />

            <NavLink href="/dashboard/simulation">Simulación</NavLink>
            <NavLink href="/dashboard/portfolio">Rendimiento</NavLink>
            <NavLink href="/dashboard/insights" className="hidden sm:inline">Insights</NavLink>
            <NavLink href="/dashboard/import" className="hidden sm:inline">Importar</NavLink>
            <NavLink href="/dashboard/help" className="hidden sm:inline">Ayuda</NavLink>
            <NavLink href="/dashboard/settings">Ajustes</NavLink>

            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">{children}</main>

      <footer className="py-4 text-center text-xs text-slate-400 border-t border-slate-200">
        Developed by Joan Antoni González
      </footer>
    </div>
  );
}
