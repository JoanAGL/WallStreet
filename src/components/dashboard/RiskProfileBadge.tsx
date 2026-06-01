import Link from "next/link";

interface Props {
  riskLabel: string | null;
}

// Dark-header variant — semi-transparent pills that read well on #1B2130
const COLORS: Record<string, string> = {
  Conservador: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  Moderado:    "bg-amber-500/20 text-amber-300 border-amber-500/40",
  Agresivo:    "bg-red-500/20 text-red-300 border-red-500/40",
};

export default function RiskProfileBadge({ riskLabel }: Props) {
  if (!riskLabel) {
    return (
      <Link
        href="/dashboard/risk-profile"
        className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-dashed border-slate-600 text-slate-400 hover:border-sky-400 hover:text-sky-300 transition-colors"
      >
        + Perfil
      </Link>
    );
  }

  return (
    <Link
      href="/dashboard/risk-profile"
      title="Actualizar perfil de riesgo"
      className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${COLORS[riskLabel] ?? "bg-white/10 text-slate-300 border-white/20"}`}
    >
      {riskLabel}
    </Link>
  );
}
