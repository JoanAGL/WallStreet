import type { RiskLevel } from "@/lib/riskCalculator";

const RISK_CONFIG: Record<RiskLevel, { label: string; bg: string; bd: string; fg: string; dot: string }> = {
  Bajo:  { label: "Riesgo Bajo",  bg: "rgba(22,163,74,.15)",  bd: "rgba(22,163,74,.4)",  fg: "#4ADE80",  dot: "#16A34A" },
  Medio: { label: "Riesgo Medio", bg: "rgba(245,158,11,.15)", bd: "rgba(245,158,11,.4)", fg: "#FCD34D",  dot: "#F59E0B" },
  Alto:  { label: "Riesgo Alto",  bg: "rgba(239,68,68,.15)",  bd: "rgba(239,68,68,.4)",  fg: "#F87171",  dot: "#EF4444" },
};

interface Props {
  level: RiskLevel;
  className?: string;
}

export default function RiskBadge({ level }: Props) {
  const cfg = RISK_CONFIG[level];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "3px 10px", borderRadius: 9999,
        fontSize: 12, fontWeight: 500,
        background: cfg.bg, border: `1px solid ${cfg.bd}`, color: cfg.fg,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}
