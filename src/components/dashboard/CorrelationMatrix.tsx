"use client";

import { useEffect, useState } from "react";
import type { CorrelationResult } from "@/lib/portfolioMath";

function cellStyle(v: number): { background: string; color: string; fontWeight?: number } {
  if (v >= 1)   return { background: "var(--card-raised)", color: "var(--fg-4)" };
  if (v > 0.75) return { background: "#FECACA", color: "#991B1B", fontWeight: 600 };
  if (v > 0.4)  return { background: "#FEF9C3", color: "#854D0E" };
  return           { background: "#DCFCE7", color: "#166534" };
}

export default function CorrelationMatrix() {
  const [data, setData]       = useState<CorrelationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portfolio/correlation")
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setData(d as CorrelationResult); })
      .catch(() => setError("Error al calcular la correlación."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, padding: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--fg-5)", marginBottom: 12 }}>
          Matriz de correlación
        </p>
        <div style={{ height: 96, borderRadius: 8, background: "var(--card-inner)", animation: "pulse 2s infinite" }} />
      </div>
    );
  }

  if (error || !data || data.tickers.length < 2) return null;

  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--fg-5)" }}>
          Matriz de correlación
        </p>
        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--fg-4)" }}>
          <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "#DCFCE7", display: "inline-block" }} /> Baja (&lt;0.4)
          </span>
          <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "#FEF9C3", display: "inline-block" }} /> Media
          </span>
          <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "#FECACA", display: "inline-block" }} /> Alta (&gt;0.75)
          </span>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 4, fontSize: 12, minWidth: "max-content" }}>
          <thead>
            <tr>
              <th style={{ padding: "4px 6px", width: 40 }} />
              {data.tickers.map((t) => (
                <th key={t} style={{ padding: "4px 6px", textAlign: "center", fontWeight: 600, color: "var(--fg-4)" }}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.matrix.map((row, i) => (
              <tr key={data.tickers[i]}>
                <td style={{ padding: "4px 6px", fontWeight: 600, color: "var(--fg-4)" }}>{data.tickers[i]}</td>
                {row.map((val, j) => {
                  const cs = cellStyle(val);
                  return (
                    <td
                      key={j}
                      style={{ padding: "6px 8px", textAlign: "center", borderRadius: 5, ...cs }}
                    >
                      {val.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* High-correlation warnings */}
      {data.highPairs.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 4, borderTop: "1px solid var(--card-border-inner)" }}>
          {data.highPairs.map((pair) => (
            <span
              key={`${pair.a}-${pair.b}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 10px", borderRadius: 8, fontSize: 12,
                background: "var(--neg-bg)", border: "1px solid var(--neg-bd)", color: "#FCA5A5",
              }}
            >
              ⚠ {pair.a} y {pair.b} correlación {pair.correlation.toFixed(2)} — riesgo de solapamiento, considera diversificar
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
