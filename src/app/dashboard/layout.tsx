import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutButton from "@/components/dashboard/LogoutButton";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-gray-900">My Personal Advisor</span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 hidden sm:inline">
              {session.user.name ?? session.user.email}
            </span>
            <Link href="/dashboard/help" className="text-sm text-gray-500 hover:text-gray-700">
              ¿Cómo funciona?
            </Link>
            <Link href="/dashboard/settings" className="text-sm text-gray-500 hover:text-gray-700">
              Ajustes
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">{children}</main>

      <footer className="py-4 text-center text-xs text-gray-400 border-t border-gray-100">
        Developed by Joan Antoni González
      </footer>
    </div>
  );
}
