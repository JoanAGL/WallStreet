import Link from "next/link";

interface Props {
  riskLabel: string | null;
}

const COLORS: Record<string, string> = {
  Conservador: "bg-blue-100 text-blue-700 border-blue-200",
  Moderado:    "bg-amber-100 text-amber-700 border-amber-200",
  Agresivo:    "bg-red-100 text-red-700 border-red-200",
};

export default function RiskProfileBadge({ riskLabel }: Props) {
  if (!riskLabel) {
    return (
      <Link
        href="/dashboard/risk-profile"
        className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-colors"
      >
        + Perfil de riesgo
      </Link>
    );
  }

  return (
    <Link
      href="/dashboard/risk-profile"
      title="Actualizar perfil de riesgo"
      className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${COLORS[riskLabel] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}
    >
      {riskLabel}
    </Link>
  );
}
