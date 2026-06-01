import type React from "react";
import Link from "next/link";
import type { StockWithAnalysis } from "@/types/models";
import type { AllHorizonsAIAnalysis } from "@/services/aiAnalysisService";

interface Props {
  stocks: StockWithAnalysis[];
}

function getActiveScenario(stock: StockWithAnalysis): "Positivo" | "Neutral" | "Negativo" {
  const a = stock.analysis;
  if (!a) return "Neutral";

  if (a.allHorizons) {
    try {
      const all = JSON.parse(a.allHorizons) as AllHorizonsAIAnalysis;
      const key =
        stock.investmentHorizon === "MEDIUM_TERM" ? "mediumTerm" :
        stock.investmentHorizon === "LONG_TERM"   ? "longTerm"   : "shortTerm";
      const label = all[key]?.scenarioLabel;
      if (label === "Positivo" || label === "Negativo") return label;
    } catch { /* ignore */ }
  }

  const label = a.scenarioLabel;
  if (label === "Positivo" || label === "Negativo") return label;
  return "Neutral";
}

function fmtMoney(n: number): string {
  return n.toLocaleString("es-ES", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

export default function PortfolioSummary({ stocks }: Props) {
  const withAnalysis = stocks.filter((s) => s.analysis);
  if (withAnalysis.length < 2) return null;

  const positivo    = withAnalysis.filter((s) => getActiveScenario(s) === "Positivo").length;
  const negativo    = withAnalysis.filter((s) => getActiveScenario(s) === "Negativo").length;
  const neutral     = withAnalysis.length - positivo - negativo;
  const divergencias = withAnalysis.filter((s) => s.analysis?.divergenceAlert).length;
  const avgChange   = withAnalysis.reduce((sum, s) => sum + (s.analysis?.changePercent ?? 0), 0) / withAnalysis.length;

  // Aggregate P&L across positions with purchase data
  const withPosition = withAnalysis.filter(
    (s) => s.purchasePrice != null && s.quantity != null
  );
  const totalCost    = withPosition.reduce((sum, s) => sum + s.purchasePrice! * s.quantity!, 0);
  const totalValue   = withPosition.reduce((sum, s) => sum + (s.analysis?.price ?? 0) * s.quantity!, 0);
  const totalPnl     = withPosition.length > 0 ? totalValue - totalCost : null;
  const totalPnlPct  = totalPnl != null && totalCost > 0 ? (totalPnl / totalCost) * 100 : null;

  const leanPos = positivo > negativo;
  const leanNeg = negativo > positivo;
  const containerStyle: React.CSSProperties = {
    borderRadius: 12,
    border: `1px solid ${leanPos ? "rgba(16,163,74,.3)" : leanNeg ? "rgba(239,68,68,.3)" : "var(--card-border)"}`,
    background: leanPos ? "rgba(16,163,74,.07)" : leanNeg ? "rgba(239,68,68,.07)" : "var(--card-bg)",
    padding: "12px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  };

  const pill = (bg: string, bd: string, fg: string, label: string) => (
    <span style={{ padding: "3px 11px", borderRadius: 9999, fontSize: 12, fontWeight: 500, border: `1px solid ${bd}`, background: bg, color: fg }}>
      {label}
    </span>
  );

  return (
    <div style={containerStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--fg-5)" }}>
          Resumen de cartera
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <a href="/api/portfolio/export?format=csv" download style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-4)", textDecoration: "none" }}>
            ↓ CSV
          </a>
          <Link href="/dashboard/portfolio" style={{ fontSize: 13, fontWeight: 500, color: "var(--link)", textDecoration: "none" }}>
            Rendimiento →
          </Link>
          <Link href="/dashboard/history" style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-4)", textDecoration: "none" }}>
            Historial →
          </Link>
          <Link href="/dashboard/simulation" style={{ fontSize: 13, fontWeight: 500, color: "var(--link)", textDecoration: "none" }}>
            Monte Carlo &amp; Optimización →
          </Link>
        </div>
      </div>

      {/* Scenario pills + daily change */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {positivo > 0 && pill("rgba(16,163,74,.15)", "rgba(16,163,74,.4)", "#4ADE80", `${positivo} Positivo${positivo > 1 ? "s" : ""}`)}
        {neutral  > 0 && pill("rgba(245,158,11,.15)", "rgba(245,158,11,.4)", "#FBBF24", `${neutral} Neutral${neutral > 1 ? "es" : ""}`)}
        {negativo > 0 && pill("rgba(239,68,68,.15)", "rgba(239,68,68,.4)", "#F87171", `${negativo} Negativo${negativo > 1 ? "s" : ""}`)}

        <span style={{ color: "var(--fg-5)" }}>·</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: avgChange >= 0 ? "#4ADE80" : "#F87171" }}>
          {avgChange >= 0 ? "+" : ""}{avgChange.toFixed(2)}% hoy
        </span>

        {divergencias > 0 && (
          <>
            <span style={{ color: "var(--fg-5)" }}>·</span>
            <span style={{ display: "inline-flex", gap: 5, alignItems: "center", fontSize: 12, fontWeight: 500, color: "#FCD34D", background: "rgba(245,158,11,.12)", border: "1px solid rgba(245,158,11,.35)", padding: "3px 11px", borderRadius: 9999 }}>
              ⚠ {divergencias} divergencia{divergencias > 1 ? "s" : ""}
            </span>
          </>
        )}
      </div>

      {/* Aggregate P&L */}
      {totalPnl != null && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, paddingTop: 6, borderTop: "1px solid var(--card-border-inner)", fontSize: 12 }}>
          <span style={{ color: "var(--fg-5)" }}>
            Invertido: <span style={{ fontWeight: 500, color: "var(--fg-3)" }}>{fmtMoney(totalCost)}</span>
          </span>
          <span style={{ color: "var(--fg-5)" }}>
            Valor: <span style={{ fontWeight: 500, color: "var(--fg-3)" }}>{fmtMoney(totalValue)}</span>
          </span>
          <span style={{ fontWeight: 600, color: totalPnl >= 0 ? "#4ADE80" : "#F87171" }}>
            P&L: {totalPnl >= 0 ? "+" : ""}{fmtMoney(totalPnl)}
            {totalPnlPct != null && (
              <span style={{ fontWeight: 400, marginLeft: 4 }}>
                ({totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%)
              </span>
            )}
          </span>
          {withPosition.length < withAnalysis.length && (
            <span style={{ color: "var(--fg-5)", fontStyle: "italic" }}>
              · {withPosition.length}/{withAnalysis.length} posiciones
            </span>
          )}
        </div>
      )}
    </div>
  );
}
