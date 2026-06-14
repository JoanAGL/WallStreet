"use client";

import { useState, useEffect, useCallback } from "react";

interface DataPoint { date: string; value: number; cost: number }

const PERIODS = [
  { label: "1a",  months: 12 },
  { label: "3a",  months: 36 },
  { label: "5a",  months: 60 },
  { label: "Máx", months: Infinity },
] as const;

function Chart({ points, period }: { points: DataPoint[]; period: number }) {
  const slice = period === Infinity ? points : points.slice(-period);
  if (slice.length < 2) return <p className="text-xs text-gray-400 text-center py-6">Datos insuficientes para el período seleccionado.</p>;

  const W = 600; const H = 200;
  const PAD = { top: 12, right: 16, bottom: 28, left: 70 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const allVals = slice.flatMap((p) => [p.value, p.cost]);
  const minV = Math.min(...allVals) * 0.95;
  const maxV = Math.max(...allVals) * 1.02;
  const range = maxV - minV || 1;
  const n = slice.length;
  const x = (i: number) => PAD.left + (i / (n - 1)) * cW;
  const y = (v: number) => PAD.top + cH - ((v - minV) / range) * cH;
  const poly = (arr: number[]) => arr.map((v, i) => `${x(i)},${y(v)}`).join(" ");

  const fmt = (v: number) =>
    v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M`
    : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}K`
    : `$${v.toFixed(0)}`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => minV + f * range);

  const xStep = Math.max(1, Math.floor((n - 1) / 5));
  const xTicks = Array.from({ length: 6 }, (_, i) => Math.min(i * xStep, n - 1));

  const lastValue = slice[n - 1].value;
  const lastCost  = slice[n - 1].cost;
  const firstValue = slice[0].value > 0 ? slice[0].value : slice[0].cost;
  const returnPct = firstValue > 0 ? ((lastValue - firstValue) / firstValue) * 100 : 0;
  const isGain = lastValue >= lastCost;

  // Area fill under value line
  const areaPoints = `${x(0)},${y(minV)} ${poly(slice.map((p) => p.value))} ${x(n - 1)},${y(minV)}`;

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-3 flex-wrap">
        <span style={{ fontSize: 22, fontWeight: 700, color: isGain ? "#4ADE80" : "#F87171" }}>
          {fmt(lastValue)}
        </span>
        <span style={{ fontSize: 13, color: isGain ? "#4ADE80" : "#F87171", fontWeight: 600 }}>
          {returnPct >= 0 ? "+" : ""}{returnPct.toFixed(2)}%
        </span>
        <span style={{ fontSize: 12, color: "var(--fg-5)" }}>
          Invertido: {fmt(lastCost)}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }}>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={y(v)} x2={PAD.left + cW} y2={y(v)} stroke="#f0f0f0" strokeWidth="1" />
            <text x={PAD.left - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="#9ca3af">{fmt(v)}</text>
          </g>
        ))}
        {xTicks.map((idx) => (
          <text key={idx} x={x(idx)} y={H - 4} textAnchor="middle" fontSize="9" fill="#9ca3af">
            {slice[idx]?.date ?? ""}
          </text>
        ))}

        {/* Area under value */}
        <polygon points={areaPoints} fill={isGain ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)"} />

        {/* Cost basis (dashed) */}
        <polyline points={poly(slice.map((p) => p.cost))} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4,3" />

        {/* Value line */}
        <polyline points={poly(slice.map((p) => p.value))} fill="none" stroke={isGain ? "#4ADE80" : "#F87171"} strokeWidth="2.5" />

        {/* Legend */}
        <g transform={`translate(${PAD.left + 8}, ${PAD.top + 6})`}>
          <line x1="0" y1="0" x2="14" y2="0" stroke={isGain ? "#4ADE80" : "#F87171"} strokeWidth="2.5" />
          <text x="18" y="0" dominantBaseline="middle" fontSize="9" fill="#6b7280">Valor cartera</text>
          <line x1="90" y1="0" x2="104" y2="0" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4,3" />
          <text x="108" y="0" dominantBaseline="middle" fontSize="9" fill="#6b7280">Capital invertido</text>
        </g>
      </svg>
    </div>
  );
}

export default function PatrimonioChart() {
  const [points,  setPoints]  = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [period,  setPeriod]  = useState<number>(60);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch("/api/portfolio/value-history");
      const data = await res.json() as { points?: DataPoint[]; error?: string };
      if (data.error) { setError(data.error); return; }
      setPoints(data.points ?? []);
    } catch {
      setError("Error al cargar el historial.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{ borderRadius: 12, border: "1px solid var(--card-border)", background: "var(--card-bg)", padding: "16px", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "var(--fg-5)" }}>Cargando evolución histórica…</p>
      </div>
    );
  }

  if (error || points.length < 2) {
    return null;
  }

  return (
    <div style={{ borderRadius: 12, border: "1px solid var(--card-border)", background: "var(--card-bg)", padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--fg-5)" }}>
          Evolución del patrimonio
        </p>
        <div style={{ display: "flex", gap: 4 }}>
          {PERIODS.map((p) => (
            <button
              key={p.label}
              onClick={() => setPeriod(p.months)}
              style={{
                padding: "3px 10px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                border: "1px solid var(--card-border)",
                background: period === p.months ? "var(--accent)" : "transparent",
                color: period === p.months ? "#fff" : "var(--fg-4)",
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <Chart points={points} period={period} />
    </div>
  );
}
