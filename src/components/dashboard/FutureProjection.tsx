"use client";

import { useState } from "react";
import type { StockWithAnalysis } from "@/types/models";

interface Props {
  stocks: StockWithAnalysis[];
}

const W = 580, H = 220;
const ML = 72, MR = 20, MT = 20, MB = 36;
const PW = W - ML - MR; // 488
const PH = H - MT - MB; // 164

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

// Future value with annual rate and monthly contributions
// Returns array of values at years 0, 1, 2, ..., horizonYears
function project(startValue: number, annualRatePct: number, monthlyContrib: number, horizonYears: number): number[] {
  const r = annualRatePct / 100 / 12; // monthly rate
  const pts = [startValue];
  let v = startValue;
  for (let m = 1; m <= horizonYears * 12; m++) {
    v = v * (1 + r) + monthlyContrib;
    if (m % 12 === 0) pts.push(v);
  }
  return pts;
}

export default function FutureProjection({ stocks }: Props) {
  const [monthly, setMonthly] = useState(0);
  const [horizon, setHorizon] = useState<1 | 3 | 5 | 10>(10);

  // Compute CAGR from stocks (same logic as PortfolioSummary)
  const withPosition = stocks.filter(
    (s) =>
      s.purchasePrice != null &&
      s.quantity != null &&
      (s.analysis?.priceUSD ?? s.analysis?.price ?? 0) > 0
  );

  const totalCost = withPosition.reduce((sum, s) => sum + s.purchasePrice! * s.quantity!, 0);
  const totalValue = withPosition.reduce(
    (sum, s) => sum + (s.analysis!.priceUSD ?? s.analysis!.price) * s.quantity!,
    0
  );

  const earliestDate = withPosition
    .map((s) => s.purchaseDate)
    .filter(Boolean)
    .reduce<Date | null>((min, d) => (!min || d! < min ? d! : min), null);

  const yearsHeld =
    earliestDate != null
      ? (Date.now() - earliestDate.getTime()) / (365.25 * 24 * 3600 * 1000)
      : null;

  const cagr =
    yearsHeld != null && yearsHeld >= 0.5 && totalCost > 0 && totalValue > 0
      ? (Math.pow(totalValue / totalCost, 1 / yearsHeld) - 1) * 100
      : null;

  if (totalValue <= 0) return null;

  const cagrLabel = cagr != null ? `${cagr >= 0 ? "+" : ""}${cagr.toFixed(2)}%/año` : null;

  // Base rate: use historical CAGR (min 0%) or 7% if unknown/negative
  const baseRate = cagr != null && cagr >= 0 ? cagr : cagr != null && cagr < 0 ? 5 : 7;

  const scenarios = [
    { id: "opt",  label: "Optimista",  mult: 1.3, color: "#22c55e" },
    { id: "base", label: "Base",       mult: 1.0, color: "#3b82f6" },
    { id: "pes",  label: "Pesimista",  mult: 0.6, color: "#f87171" },
  ] as const;

  // Generate data series for current horizon
  const seriesData = scenarios.map((s) => {
    const rate = Math.max(baseRate * s.mult, -10); // floor at -10%
    return {
      ...s,
      rate,
      points: project(totalValue, rate, monthly, horizon),
    };
  });

  // Chart scale
  const allValues = seriesData.flatMap((s) => s.points);
  const maxVal = Math.max(...allValues) * 1.05;
  const minVal = Math.min(...allValues, 0) * 0.95;
  const valRange = maxVal - minVal || 1;

  const scaleX = (t: number) => ML + (t / horizon) * PW;
  const scaleY = (v: number) => MT + PH - ((v - minVal) / valRange) * PH;

  // Y-axis ticks
  const yStep = valRange / 4;
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const v = minVal + yStep * i;
    return { y: scaleY(v), label: fmtMoney(v) };
  });

  // X-axis ticks
  const xPoints = [0, Math.floor(horizon / 2), horizon];

  return (
    <div style={{
      borderRadius: 12,
      border: "1px solid var(--card-border)",
      background: "var(--card-bg)",
      padding: "12px 16px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--fg-5)" }}>
            Proyección futura
          </p>
          {cagrLabel && (
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--fg-5)" }}>
              CAGR histórico: <span style={{ fontWeight: 600, color: cagr! >= 0 ? "#4ade80" : "#f87171" }}>{cagrLabel}</span>
              {cagr == null || cagr < 0 ? " · usando 5% como base" : ""}
            </p>
          )}
          {cagr == null && (
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--fg-5)" }}>
              Sin historial de compras · usando 7% (retorno histórico SP500) como base
            </p>
          )}
        </div>

        {/* Horizon selector */}
        <div style={{ display: "flex", gap: 4 }}>
          {([1, 3, 5, 10] as const).map((h) => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              style={{
                padding: "3px 10px",
                borderRadius: 8,
                border: "1px solid var(--card-border)",
                background: horizon === h ? "var(--accent, #3b82f6)" : "transparent",
                color: horizon === h ? "#fff" : "var(--fg-4)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {h}A
            </button>
          ))}
        </div>
      </div>

      {/* Scenario legend */}
      <div style={{ display: "flex", gap: 14, marginBottom: 8, flexWrap: "wrap" }}>
        {seriesData.map((s) => (
          <span key={s.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--fg-4)" }}>
            <span style={{ width: 14, height: 3, borderRadius: 2, background: s.color, display: "inline-block" }} />
            {s.label} ({s.rate >= 0 ? "+" : ""}{s.rate.toFixed(1)}%/año)
          </span>
        ))}
        {monthly > 0 && (
          <span style={{ fontSize: 11, color: "var(--fg-5)" }}>
            + {fmtMoney(monthly)}/mes
          </span>
        )}
      </div>

      {/* SVG chart */}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {/* Grid + Y labels */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={ML} y1={t.y} x2={ML + PW} y2={t.y} stroke="var(--card-border)" strokeWidth={0.5} />
            <text x={ML - 5} y={t.y + 3} textAnchor="end" fontSize={9} fill="var(--fg-5)">{t.label}</text>
          </g>
        ))}

        {/* Current value reference line */}
        <line
          x1={ML} y1={scaleY(totalValue)}
          x2={ML + PW} y2={scaleY(totalValue)}
          stroke="var(--fg-5)" strokeWidth={0.5} strokeDasharray="4 3"
        />

        {/* Scenario lines */}
        {seriesData.map((s) => {
          const path = s.points
            .map((v, t) => `${t === 0 ? "M" : "L"} ${scaleX(t).toFixed(1)} ${scaleY(v).toFixed(1)}`)
            .join(" ");

          // Area fill for base scenario
          const areaPath =
            s.id === "base"
              ? `${path} L ${scaleX(horizon).toFixed(1)} ${scaleY(minVal).toFixed(1)} L ${ML.toFixed(1)} ${scaleY(minVal).toFixed(1)} Z`
              : null;

          return (
            <g key={s.id}>
              {areaPath && (
                <path d={areaPath} fill={s.color} fillOpacity={0.07} />
              )}
              <path d={path} fill="none" stroke={s.color} strokeWidth={s.id === "base" ? 2 : 1.5} />
              {/* End-point label */}
              {s.points.length > 0 && (() => {
                const endVal = s.points[s.points.length - 1];
                const ex = scaleX(horizon) + 4;
                const ey = scaleY(endVal) + 3;
                // Only label if in chart bounds
                if (ey < MT || ey > MT + PH + 8) return null;
                return (
                  <text x={ex} y={ey} fontSize={8} fill={s.color} fontWeight={600}>
                    {fmtMoney(endVal)}
                  </text>
                );
              })()}
            </g>
          );
        })}

        {/* X-axis ticks */}
        {xPoints.map((t) => (
          <g key={t}>
            <line x1={scaleX(t)} y1={MT + PH} x2={scaleX(t)} y2={MT + PH + 4} stroke="var(--fg-5)" strokeWidth={0.5} />
            <text x={scaleX(t)} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--fg-5)">
              {t === 0 ? "Hoy" : `+${t}A`}
            </text>
          </g>
        ))}

        {/* Axes */}
        <line x1={ML} y1={MT} x2={ML} y2={MT + PH} stroke="var(--fg-5)" strokeWidth={0.5} />
        <line x1={ML} y1={MT + PH} x2={ML + PW} y2={MT + PH} stroke="var(--fg-5)" strokeWidth={0.5} />
      </svg>

      {/* Monthly contribution input */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        <label style={{ fontSize: 12, color: "var(--fg-4)", whiteSpace: "nowrap" }}>
          Aportación mensual:
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--fg-5)" }}>$</span>
          <input
            type="number"
            min={0}
            step={100}
            value={monthly}
            onChange={(e) => setMonthly(Math.max(0, Number(e.target.value)))}
            style={{
              width: 90,
              padding: "3px 6px",
              borderRadius: 6,
              border: "1px solid var(--card-border)",
              background: "var(--card-bg)",
              color: "var(--fg-2)",
              fontSize: 12,
            }}
          />
          <span style={{ fontSize: 11, color: "var(--fg-5)" }}>/mes</span>
        </div>
      </div>

      {/* Disclaimer */}
      <p style={{ margin: "8px 0 0", fontSize: 10, color: "var(--fg-5)", fontStyle: "italic" }}>
        ⚠ Proyección basada en retornos históricos. No garantiza resultados futuros.
        Los mercados pueden diferir significativamente de las estimaciones.
      </p>
    </div>
  );
}
