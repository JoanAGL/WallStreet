"use client";

import { useEffect, useState } from "react";
import type { FinancialsTableData } from "@/app/api/stock/financials-table/route";

const EUR_SUFFIXES = [".MC", ".AS", ".PA", ".DE", ".MI", ".L", ".CO", ".F", ".BR", ".OL", ".ST", ".SW", ".LS"];

function currencySymbol(ticker: string) {
  return EUR_SUFFIXES.some((s) => ticker.endsWith(s)) ? "€" : "$";
}

function fmtVal(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(1)}B`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  return n.toFixed(0);
}

const W = 620, H = 240;
const ML = 60, MR = 48, MT = 20, MB = 36;
const PW = W - ML - MR; // 512
const PH = H - MT - MB; // 184

interface Props {
  ticker: string;
}

export default function EarningsChart({ ticker }: Props) {
  const [data, setData] = useState<FinancialsTableData | null>(null);

  useEffect(() => {
    fetch(`/api/stock/financials-table?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [ticker]);

  if (!data) return null;

  const rows = data.rows;
  if (rows.length < 2) return null;

  // Need at least one revenue or ebitda value to render
  const hasData = rows.some((r) => r.revenue != null && r.revenue > 0);
  if (!hasData) return null;

  const N = rows.length;
  const colW = PW / N;
  const bw = Math.min(colW * 0.32, 36);

  // Left Y-axis: Revenue / EBITDA (same absolute scale)
  const maxRev = Math.max(...rows.map((r) => Math.max(r.revenue ?? 0, r.ebitda ?? 0, 0)));
  if (maxRev <= 0) return null;

  // Right Y-axis: EPS
  const epsVals = rows.map((r) => r.eps).filter((v): v is number => v != null);
  const maxEps = epsVals.length > 0 ? Math.max(...epsVals.map(Math.abs), 0.1) : 1;
  const minEps = epsVals.length > 0 ? Math.min(Math.min(...epsVals), 0) : 0;
  const epsRange = maxEps - minEps || 1;

  const scaleR = (v: number) => PH * (1 - (v - minEps) / epsRange);

  // Y-axis ticks (left)
  const ticks = [0, 0.25, 0.5, 0.75, 1.0];

  // EPS line points
  const epsPoints = rows.reduce<Array<{ x: number; y: number; isEst: boolean }>>((acc, row, i) => {
    if (row.eps == null) return acc;
    acc.push({
      x: ML + i * colW + colW / 2,
      y: MT + scaleR(row.eps),
      isEst: row.period === "E",
    });
    return acc;
  }, []);

  const epsPath =
    epsPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  const cur = currencySymbol(ticker);

  return (
    <div style={{
      borderRadius: 12,
      border: "1px solid var(--card-border)",
      background: "var(--card-bg)",
      padding: "12px 16px",
    }}>
      {/* Header + legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--fg-5)" }}>
          Revenue &amp; EBITDA
        </p>
        <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--fg-4)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: "#3b82f6", display: "inline-block" }} />
            Revenue
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: "#10b981", display: "inline-block" }} />
            EBITDA
          </span>
          {epsPoints.length > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 14, height: 3, borderRadius: 2, background: "#f97316", display: "inline-block" }} />
              EPS ({cur})
            </span>
          )}
          <span style={{ color: "var(--fg-5)", fontStyle: "italic" }}>E = estimación</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {/* Grid lines + left Y labels */}
        {ticks.map((f, i) => {
          const y = MT + PH * (1 - f);
          return (
            <g key={i}>
              <line x1={ML} y1={y} x2={ML + PW} y2={y} stroke="var(--card-border)" strokeWidth={0.5} />
              {f > 0 && (
                <text x={ML - 5} y={y + 3} textAnchor="end" fontSize={9} fill="var(--fg-5)">
                  {fmtVal(maxRev * f)}
                </text>
              )}
            </g>
          );
        })}

        {/* Right Y labels for EPS */}
        {epsPoints.length > 0 &&
          [0, 0.5, 1.0].map((f, i) => {
            const v = minEps + epsRange * f;
            const y = MT + scaleR(v);
            return (
              <text key={i} x={ML + PW + 5} y={y + 3} textAnchor="start" fontSize={9} fill="#f97316">
                {v.toFixed(1)}
              </text>
            );
          })}

        {/* Bars + X labels */}
        {rows.map((row, i) => {
          const baseX = ML + i * colW + (colW - bw * 2 - 3) / 2;
          const isEst = row.period === "E";
          const opacity = isEst ? 0.48 : 0.88;

          const revH = row.revenue != null && row.revenue > 0 ? (row.revenue / maxRev) * PH : 0;
          const ebiH = row.ebitda != null && row.ebitda > 0 ? (row.ebitda / maxRev) * PH : 0;

          return (
            <g key={row.year}>
              {revH > 0 && (
                <rect
                  x={baseX} y={MT + PH - revH}
                  width={bw} height={revH}
                  fill="#3b82f6" opacity={opacity} rx={2}
                />
              )}
              {ebiH > 0 && (
                <rect
                  x={baseX + bw + 3} y={MT + PH - ebiH}
                  width={bw} height={ebiH}
                  fill="#10b981" opacity={opacity} rx={2}
                />
              )}
              <text
                x={ML + i * colW + colW / 2} y={H - 8}
                textAnchor="middle" fontSize={9}
                fill={isEst ? "#818cf8" : "var(--fg-5)"}
              >
                {row.year}{isEst ? "E" : ""}
              </text>
            </g>
          );
        })}

        {/* EPS line */}
        {epsPoints.length >= 2 && (
          <path d={epsPath} fill="none" stroke="#f97316" strokeWidth={1.5} />
        )}
        {epsPoints.map((p, i) => (
          <circle
            key={i}
            cx={p.x} cy={p.y} r={2.5}
            fill={p.isEst ? "var(--card-bg)" : "#f97316"}
            stroke="#f97316" strokeWidth={1.5}
          />
        ))}

        {/* Axes */}
        <line x1={ML} y1={MT} x2={ML} y2={MT + PH} stroke="var(--fg-5)" strokeWidth={0.5} />
        <line x1={ML} y1={MT + PH} x2={ML + PW} y2={MT + PH} stroke="var(--fg-5)" strokeWidth={0.5} />
      </svg>
    </div>
  );
}
