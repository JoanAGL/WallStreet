"use client";

import { useEffect, useState } from "react";
import type { WeeklyPoint } from "@/app/api/portfolio/wealth-history/route";

type Period = "6M" | "1A" | "2A";

const W = 620, H = 240;
const ML = 76, MR = 20, MT = 20, MB = 36;
const PW = W - ML - MR; // 524
const PH = H - MT - MB; // 184

function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)    return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function periodMonths(p: Period): number {
  return p === "6M" ? 6 : p === "1A" ? 12 : 24;
}

export default function WealthChart() {
  const [allPoints, setAllPoints] = useState<WeeklyPoint[] | null>(null);
  const [period, setPeriod] = useState<Period>("1A");

  useEffect(() => {
    fetch("/api/portfolio/wealth-history")
      .then((r) => r.json())
      .then((d) => setAllPoints(d.points ?? []))
      .catch(() => setAllPoints([]));
  }, []);

  // Not loaded yet — render nothing (no skeleton to avoid layout shift)
  if (allPoints === null) return null;
  if (allPoints.length < 4) return null;

  // Filter by selected period
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - periodMonths(period));
  const filtered = allPoints.filter((p) => new Date(p.date) >= cutoffDate);
  if (filtered.length < 4) return null;

  const N = filtered.length;
  const firstPt = filtered[0];
  const lastPt  = filtered[N - 1];

  // Gain/loss over the period
  const returnPct =
    firstPt.value > 0 ? ((lastPt.value - firstPt.value) / firstPt.value) * 100 : null;
  const gainAbs = lastPt.value - firstPt.value;
  const isPos   = gainAbs >= 0;

  // Chart scales
  const allVals  = filtered.flatMap((p) => [p.value, p.invested]);
  const rawMin   = Math.min(...allVals);
  const rawMax   = Math.max(...allVals);
  const padding  = (rawMax - rawMin) * 0.08 || rawMax * 0.05;
  const minVal   = Math.max(0, rawMin - padding);
  const maxVal   = rawMax + padding;
  const valRange = maxVal - minVal || 1;

  const scaleX = (i: number) => ML + (i / (N - 1)) * PW;
  const scaleY = (v: number) => MT + PH - ((v - minVal) / valRange) * PH;

  // Paths
  const valuePath    = filtered.map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(i).toFixed(1)} ${scaleY(p.value).toFixed(1)}`).join(" ");
  const investedPath = filtered.map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(i).toFixed(1)} ${scaleY(p.invested).toFixed(1)}`).join(" ");

  // Area fill under portfolio value line
  const baseY  = scaleY(minVal).toFixed(1);
  const areaPath = `${valuePath} L ${scaleX(N - 1).toFixed(1)} ${baseY} L ${scaleX(0).toFixed(1)} ${baseY} Z`;

  // Y-axis ticks
  const ySteps = 4;
  const yTicks = Array.from({ length: ySteps + 1 }, (_, i) => {
    const v = minVal + (valRange / ySteps) * i;
    return { y: scaleY(v), label: fmtMoney(v) };
  });

  // X-axis date labels (5 evenly spaced)
  const xLabelCount = 5;
  const xLabelIndices = Array.from({ length: xLabelCount }, (_, k) =>
    Math.round((k / (xLabelCount - 1)) * (N - 1))
  );

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
  };

  const lineColor = isPos ? "#22c55e" : "#f87171";

  return (
    <div style={{
      borderRadius: 12,
      border: "1px solid var(--card-border)",
      background: "var(--card-bg)",
      padding: "12px 16px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--fg-5)" }}>
            Evolución del patrimonio
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 3, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: "var(--fg-1)" }}>
              {fmtMoney(lastPt.value)}
            </span>
            {returnPct != null && (
              <span style={{ fontSize: 13, fontWeight: 600, color: lineColor }}>
                {gainAbs >= 0 ? "+" : ""}{fmtMoney(gainAbs)}
                <span style={{ fontWeight: 400, marginLeft: 4 }}>
                  ({returnPct >= 0 ? "+" : ""}{returnPct.toFixed(2)}%)
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Period selector */}
        <div style={{ display: "flex", gap: 4 }}>
          {(["6M", "1A", "2A"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: "3px 10px",
                borderRadius: 8,
                border: "1px solid var(--card-border)",
                background: period === p ? "var(--accent, #3b82f6)" : "transparent",
                color: period === p ? "#fff" : "var(--fg-4)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginBottom: 6, fontSize: 11, color: "var(--fg-4)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 14, height: 3, borderRadius: 2, background: lineColor, display: "inline-block" }} />
          Valor de cartera
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 14, height: 0, borderTop: "2px dashed var(--fg-5)", display: "inline-block" }} />
          Capital invertido
        </span>
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

        {/* Area fill */}
        <path d={areaPath} fill={lineColor} fillOpacity={0.08} />

        {/* Invested capital (dashed) */}
        <path d={investedPath} fill="none" stroke="var(--fg-5)" strokeWidth={1.2} strokeDasharray="5 3" />

        {/* Portfolio value line */}
        <path d={valuePath} fill="none" stroke={lineColor} strokeWidth={2} />

        {/* Start + end dots */}
        <circle cx={scaleX(0)} cy={scaleY(firstPt.value)} r={3} fill={lineColor} />
        <circle cx={scaleX(N - 1)} cy={scaleY(lastPt.value)} r={3} fill={lineColor} />

        {/* X-axis date labels */}
        {xLabelIndices.map((idx) => (
          <text
            key={idx}
            x={scaleX(idx)} y={H - 6}
            textAnchor={idx === 0 ? "start" : idx === N - 1 ? "end" : "middle"}
            fontSize={9} fill="var(--fg-5)"
          >
            {fmtDate(filtered[idx].date)}
          </text>
        ))}

        {/* Axes */}
        <line x1={ML} y1={MT} x2={ML} y2={MT + PH} stroke="var(--fg-5)" strokeWidth={0.5} />
        <line x1={ML} y1={MT + PH} x2={ML + PW} y2={MT + PH} stroke="var(--fg-5)" strokeWidth={0.5} />
      </svg>

      <p style={{ margin: "4px 0 0", fontSize: 10, color: "var(--fg-5)", fontStyle: "italic" }}>
        Precios semanales históricos vía Yahoo Finance · solo posiciones con fecha y precio de compra registrados
      </p>
    </div>
  );
}
