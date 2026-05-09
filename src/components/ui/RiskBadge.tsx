import type { RiskLevel } from "@/lib/riskCalculator";

const RISK_CONFIG: Record<
  RiskLevel,
  { label: string; bg: string; text: string; dot: string }
> = {
  Bajo: {
    label: "Riesgo Bajo",
    bg: "bg-green-100",
    text: "text-green-800",
    dot: "bg-green-500",
  },
  Medio: {
    label: "Riesgo Medio",
    bg: "bg-yellow-100",
    text: "text-yellow-800",
    dot: "bg-yellow-500",
  },
  Alto: {
    label: "Riesgo Alto",
    bg: "bg-red-100",
    text: "text-red-800",
    dot: "bg-red-500",
  },
};

interface Props {
  level: RiskLevel;
  className?: string;
}

export default function RiskBadge({ level, className = "" }: Props) {
  const cfg = RISK_CONFIG[level];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text} ${className}`}
    >
      <span className={`h-2 w-2 rounded-full ${cfg.dot}`} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}
