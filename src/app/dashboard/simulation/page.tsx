"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import type { MonteCarloResult } from "@/lib/portfolioMath";
import type { OptimizationResult } from "@/lib/portfolioMath";

// ── Fan Chart SVG ─────────────────────────────────────────────────────────────

function FanChart({ result }: { result: MonteCarloResult }) {
  const W = 600;
  const H = 220;
  const PAD = { top: 16, right: 20, bottom: 36, left: 70 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const step = Math.max(1, Math.floor(result.days / 60)); // sample max 60 points
  const indices: number[] = [];
  for (let i = 0; i <= result.days; i += step) indices.push(i);
  if (indices[indices.length - 1] !== result.days) indices.push(result.days);

  const allVals = [
    ...result.p10,
    ...result.p90,
  ];
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const range = maxV - minV || 1;

  function xOf(d: number) {
    return PAD.left + (d / result.days) * chartW;
  }
  function yOf(v: number) {
    return PAD.top + chartH - ((v - minV) / range) * chartH;
  }
  function polyline(series: number[]): string {
    return indices.map((d) => `${xOf(d)},${yOf(series[d])}`).join(" ");
  }
  function band(top: number[], bot: number[]): string {
    const fwd = indices.map((d) => `${xOf(d)},${yOf(top[d])}`).join(" ");
    const rev = [...indices].reverse().map((d) => `${xOf(d)},${yOf(bot[d])}`).join(" ");
    return `${fwd} ${rev}`;
  }

  const fmt = (v: number) =>
    v >= 1_000_000
      ? `$${(v / 1_000_000).toFixed(1)}M`
      : v >= 1_000
      ? `$${(v / 1_000).toFixed(0)}K`
      : `$${v.toFixed(0)}`;

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => minV + f * range);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }}>
      {/* Y-axis ticks */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={yOf(v)} x2={PAD.left + chartW} y2={yOf(v)}
            stroke="#f0f0f0" strokeWidth="1" />
          <text x={PAD.left - 6} y={yOf(v)} textAnchor="end" dominantBaseline="middle"
            fontSize="9" fill="#9ca3af">{fmt(v)}</text>
        </g>
      ))}

      {/* X-axis labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const d = Math.round(f * result.days);
        const months = Math.round((d / 252) * 12);
        return (
          <text key={f} x={xOf(d)} y={H - PAD.bottom + 14} textAnchor="middle"
            fontSize="9" fill="#9ca3af">
            {months === 0 ? "Hoy" : `${months}m`}
          </text>
        );
      })}

      {/* Bands */}
      <polygon points={band(result.p90, result.p10)} fill="rgba(59,130,246,0.08)" />
      <polygon points={band(result.p75, result.p25)} fill="rgba(59,130,246,0.14)" />

      {/* Percentile lines */}
      <polyline points={polyline(result.p10)} fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="3,3" />
      <polyline points={polyline(result.p25)} fill="none" stroke="#f59e0b" strokeWidth="1" />
      <polyline points={polyline(result.p50)} fill="none" stroke="#3b82f6" strokeWidth="2" />
      <polyline points={polyline(result.p75)} fill="none" stroke="#22c55e" strokeWidth="1" />
      <polyline points={polyline(result.p90)} fill="none" stroke="#16a34a" strokeWidth="1" strokeDasharray="3,3" />

      {/* Legend */}
      {[
        { label: "P90 (optimista)", color: "#16a34a" },
        { label: "P50 (probable)", color: "#3b82f6" },
        { label: "P10 (pesimista)", color: "#ef4444" },
      ].map((l, i) => (
        <g key={l.label} transform={`translate(${PAD.left + 10 + i * 140}, ${H - PAD.bottom + 26})`}>
          <line x1="0" y1="0" x2="16" y2="0" stroke={l.color} strokeWidth="2" />
          <text x="20" y="0" dominantBaseline="middle" fontSize="9" fill="#6b7280">{l.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ── Monte Carlo Section ───────────────────────────────────────────────────────

function MonteCarloSection() {
  const [horizon, setHorizon] = useState(1);
  const [monthly, setMonthly] = useState(0);
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [result, setResult] = useState<(MonteCarloResult & { mu: number; sigma: number }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horizon, monthlyContribution: monthly, portfolioValue: portfolioValue || undefined }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setResult(data);
    } catch {
      setError("Error al ejecutar la simulación.");
    } finally {
      setLoading(false);
    }
  }, [horizon, monthly, portfolioValue]);

  const fmtMoney = (v: number) =>
    v.toLocaleString("es-ES", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Simulación Monte Carlo</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Proyección probabilística basada en la volatilidad histórica de tu cartera.
          Geometric Brownian Motion · 1000 trayectorias.
        </p>
      </div>

      {/* Controls */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Horizonte temporal</label>
          <select
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            className={inputClass}
          >
            <option value={1}>1 año</option>
            <option value={3}>3 años</option>
            <option value={5}>5 años</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Aportación mensual (USD, opcional)</label>
          <input
            type="number"
            min={0}
            value={monthly || ""}
            onChange={(e) => setMonthly(Number(e.target.value))}
            placeholder="0"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Valor cartera (USD, opcional)</label>
          <input
            type="number"
            min={0}
            value={portfolioValue || ""}
            onChange={(e) => setPortfolioValue(Number(e.target.value))}
            placeholder="Auto (posiciones actuales)"
            className={inputClass}
          />
        </div>
      </div>

      <button
        onClick={run}
        disabled={loading}
        className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "Simulando 1000 trayectorias..." : "Ejecutar simulación"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="space-y-4">
          {/* Chart */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <FanChart result={result} />
          </div>

          {/* Summary table */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Pesimista (P10)", value: result.p10[result.days], color: "text-red-600" },
              { label: "Probable (P50)", value: result.p50[result.days], color: "text-blue-600" },
              { label: "Optimista (P90)", value: result.p90[result.days], color: "text-green-600" },
            ].map((s) => (
              <div key={s.label} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className={`text-base font-bold mt-1 ${s.color}`}>{fmtMoney(s.value)}</p>
              </div>
            ))}
          </div>

          {/* Risk metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-gray-500">VaR 95% (pérdida máx. probable)</p>
              <p className="text-base font-bold text-red-600 mt-1">
                {result.var95 >= 0 ? "-" : "+"}{Math.abs(result.var95).toLocaleString("es-ES", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-gray-400 mt-1 leading-tight">
                Calculado con distribución t de Student (df=5) para capturar eventos de cola.
                Más conservador que el modelo normal estándar.
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-gray-500">CVaR 95% (pérdida esperada en peor 5%)</p>
              <p className="text-base font-bold text-red-700 mt-1">
                {result.cvar95 >= 0 ? "-" : "+"}{Math.abs(result.cvar95).toLocaleString("es-ES", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-gray-400 mt-1 leading-tight">
                Expected Shortfall: media de pérdidas en el 5% peor de escenarios.
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-4 text-xs text-gray-500">
            <span>Retorno diario medio: <strong className="text-gray-700">{(result.mu * 100).toFixed(3)}%</strong></span>
            <span>Volatilidad diaria: <strong className="text-gray-700">{(result.sigma * 100).toFixed(3)}%</strong></span>
            <span>Volatilidad anualizada: <strong className="text-gray-700">{(result.sigma * Math.sqrt(252) * 100).toFixed(1)}%</strong></span>
            <span>Prob. pérdida: <strong className="text-gray-700">{(result.probabilityOfLoss * 100).toFixed(1)}%</strong></span>
          </div>

          <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-2">
            Basado en volatilidad histórica de 60 días. El rendimiento pasado no garantiza el futuro.
            Esta simulación tiene fines exclusivamente educativos y no constituye asesoramiento financiero.
          </p>
        </div>
      )}
    </section>
  );
}

// ── Markowitz / Optimization Section ─────────────────────────────────────────

function OptimizationSection() {
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/optimize");
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setResult(data as OptimizationResult);
    } catch {
      setError("Error al calcular la optimización.");
    } finally {
      setLoading(false);
    }
  }, []);

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const fmt = (v: number) => `${(v * 100).toFixed(2)}%`;

  function arrow(current: number, optimal: number): { symbol: string; color: string } {
    const diff = optimal - current;
    if (Math.abs(diff) < 0.005) return { symbol: "=", color: "text-gray-400" };
    if (diff > 0) return { symbol: "▲", color: "text-green-600" };
    return { symbol: "▼", color: "text-red-600" };
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Optimización Markowitz</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Distribución de pesos que minimiza la varianza de la cartera para los datos históricos de 60 días.
          Incluye shrinkage de Ledoit-Wolf para estabilizar la estimación.
        </p>
      </div>

      <button
        onClick={run}
        disabled={loading}
        className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "Calculando pesos óptimos..." : "Calcular pesos óptimos"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="space-y-4">
          {/* Weights comparison table */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Acción</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Actual</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Óptimo</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Diferencia</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.tickers.map((ticker, i) => {
                  const current = result.currentWeights[i];
                  const optimal = result.optimalWeights[i];
                  const diff = optimal - current;
                  const { symbol, color } = arrow(current, optimal);
                  return (
                    <tr key={ticker} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-semibold text-gray-800">{ticker}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{pct(current)}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-900">{pct(optimal)}</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : "text-gray-400"}`}>
                        {diff >= 0 ? "+" : ""}{pct(diff)}
                      </td>
                      <td className={`px-4 py-2.5 text-center text-base ${color}`}>{symbol}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Metrics comparison */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Retorno anualizado", current: fmt(result.currentReturn), optimal: fmt(result.optimalReturn) },
              { label: "Volatilidad", current: fmt(result.currentVol), optimal: fmt(result.optimalVol) },
              { label: "Ratio Sharpe", current: result.currentSharpe.toFixed(2), optimal: result.optimalSharpe.toFixed(2) },
            ].map((m) => (
              <div key={m.label} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-2">{m.label}</p>
                <div className="flex items-end gap-2">
                  <div>
                    <p className="text-xs text-gray-400">Actual</p>
                    <p className="text-sm font-semibold text-gray-700">{m.current}</p>
                  </div>
                  <span className="text-gray-300 text-sm mb-0.5">→</span>
                  <div>
                    <p className="text-xs text-gray-400">Óptimo</p>
                    <p className="text-sm font-bold text-indigo-700">{m.optimal}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Disclaimer */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 space-y-1">
            <p className="font-semibold">Limitaciones del modelo:</p>
            <ul className="list-disc list-inside space-y-0.5 text-amber-600">
              <li>Usa datos históricos de 60 días — no predice el futuro.</li>
              <li>Markowitz es sensible a los inputs: pequeños cambios en datos cambian los pesos.</li>
              <li>Los pesos óptimos asumen que las correlaciones históricas se mantienen, lo que rara vez ocurre.</li>
              <li>No constituye asesoramiento financiero. Actúa siempre con criterio propio.</li>
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

// ── DCA / Lump-Sum Simulator ─────────────────────────────────────────────────

interface DcaPoint { date: string; price: number }

function DcaChart({ dca, lump, labels }: { dca: number[]; lump: number[]; labels: string[] }) {
  const W = 600; const H = 180;
  const PAD = { top: 12, right: 16, bottom: 28, left: 64 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const allVals = [...dca, ...lump];
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const range = maxV - minV || 1;
  const n = dca.length;
  const x = (i: number) => PAD.left + (i / (n - 1)) * cW;
  const y = (v: number) => PAD.top + cH - ((v - minV) / range) * cH;
  const poly = (arr: number[]) => arr.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const fmt = (v: number) =>
    v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M`
    : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}K`
    : `$${v.toFixed(0)}`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => minV + f * range);
  const xStep = Math.max(1, Math.floor((n - 1) / 5));
  const xTicks = Array.from({ length: 6 }, (_, i) => Math.min(i * xStep, n - 1));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 180 }}>
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={y(v)} x2={PAD.left + cW} y2={y(v)} stroke="#f0f0f0" strokeWidth="1" />
          <text x={PAD.left - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="#9ca3af">{fmt(v)}</text>
        </g>
      ))}
      {xTicks.map((idx) => (
        <text key={idx} x={x(idx)} y={H - 4} textAnchor="middle" fontSize="9" fill="#9ca3af">
          {labels[idx]?.slice(0, 7) ?? ""}
        </text>
      ))}
      <polyline points={poly(dca)}  fill="none" stroke="#3b82f6" strokeWidth="2" />
      <polyline points={poly(lump)} fill="none" stroke="#22c55e" strokeWidth="2" strokeDasharray="4,3" />
      <g transform={`translate(${PAD.left + 8}, ${PAD.top + 8})`}>
        <line x1="0" y1="0" x2="14" y2="0" stroke="#3b82f6" strokeWidth="2" />
        <text x="18" y="0" dominantBaseline="middle" fontSize="9" fill="#6b7280">DCA mensual</text>
        <line x1="80" y1="0" x2="94" y2="0" stroke="#22c55e" strokeWidth="2" strokeDasharray="4,3" />
        <text x="98" y="0" dominantBaseline="middle" fontSize="9" fill="#6b7280">Inversión única</text>
      </g>
    </svg>
  );
}

function DcaSimulatorSection() {
  const [ticker,   setTicker]   = useState("SPY");
  const [initial,  setInitial]  = useState(10000);
  const [monthly,  setMonthly]  = useState(500);
  const [years,    setYears]    = useState(10);
  const [result,   setResult]   = useState<{ dca: number[]; lump: number[]; labels: string[]; totalContrib: number; totalLump: number } | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!ticker.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res  = await fetch(`/api/portfolio/dca-history?ticker=${encodeURIComponent(ticker.trim().toUpperCase())}&years=${years}`);
      const data = await res.json() as { points?: DcaPoint[]; error?: string };
      if (data.error || !data.points) { setError(data.error ?? "Sin datos"); return; }

      const pts = data.points;
      // DCA: initial at start, then monthly each month
      let dcaShares = initial / pts[0].price;
      const dcaVals: number[] = [initial];
      let totalContrib = initial;

      for (let i = 1; i < pts.length; i++) {
        const shares = monthly / pts[i].price;
        dcaShares += shares;
        totalContrib += monthly;
        dcaVals.push(dcaShares * pts[i].price);
      }

      // Lump sum: all initial + (years × 12 months × monthly) invested at start
      const totalLumpContrib = initial + monthly * (pts.length - 1);
      const lumpShares = totalLumpContrib / pts[0].price;
      const lumpVals: number[] = pts.map((p) => lumpShares * p.price);

      setResult({
        dca: dcaVals,
        lump: lumpVals,
        labels: pts.map((p) => p.date),
        totalContrib,
        totalLump: totalLumpContrib,
      });
    } catch {
      setError("Error al obtener datos históricos.");
    } finally {
      setLoading(false);
    }
  }, [ticker, initial, monthly, years]);

  const fmtMoney = (v: number) => v.toLocaleString("es-ES", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">¿Cuánto tendrías hoy?</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Compara DCA mensual vs inversión única usando precios históricos reales de Yahoo Finance.
        </p>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Ticker</label>
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="SPY"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Capital inicial (USD)</label>
          <input type="number" min={0} value={initial || ""} onChange={(e) => setInitial(Number(e.target.value))} placeholder="10000" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Aportación mensual (USD)</label>
          <input type="number" min={0} value={monthly || ""} onChange={(e) => setMonthly(Number(e.target.value))} placeholder="500" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Horizonte (años)</label>
          <select value={years} onChange={(e) => setYears(Number(e.target.value))} className={inputClass}>
            {[1, 2, 3, 5, 10].map((y) => <option key={y} value={y}>{y} año{y !== 1 ? "s" : ""}</option>)}
          </select>
        </div>
      </div>

      <button
        onClick={run}
        disabled={loading}
        className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "Cargando histórico..." : "Calcular"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <DcaChart dca={result.dca} lump={result.lump} labels={result.labels} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">DCA mensual</p>
              <p className="text-base font-bold text-blue-600">{fmtMoney(result.dca[result.dca.length - 1])}</p>
              <p className="text-xs text-gray-400 mt-0.5">Aportado: {fmtMoney(result.totalContrib)}</p>
              {result.totalContrib > 0 && (
                <p className="text-xs font-medium mt-0.5" style={{ color: result.dca[result.dca.length - 1] >= result.totalContrib ? "#4ADE80" : "#F87171" }}>
                  {((result.dca[result.dca.length - 1] / result.totalContrib - 1) * 100).toFixed(1)}% retorno total
                </p>
              )}
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">Inversión única al inicio</p>
              <p className="text-base font-bold text-green-600">{fmtMoney(result.lump[result.lump.length - 1])}</p>
              <p className="text-xs text-gray-400 mt-0.5">Invertido: {fmtMoney(result.totalLump)}</p>
              {result.totalLump > 0 && (
                <p className="text-xs font-medium mt-0.5" style={{ color: result.lump[result.lump.length - 1] >= result.totalLump ? "#4ADE80" : "#F87171" }}>
                  {((result.lump[result.lump.length - 1] / result.totalLump - 1) * 100).toFixed(1)}% retorno total
                </p>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-400 italic">
            Basado en precios históricos ajustados por dividendos y splits de Yahoo Finance.
            Los rendimientos pasados no garantizan resultados futuros. Solo con fines educativos.
          </p>
        </div>
      )}
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SimulationPage() {
  return (
    <div className="space-y-10 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">Análisis cuantitativo</h1>
      </div>

      <DcaSimulatorSection />

      <hr className="border-gray-200" />

      <MonteCarloSection />

      <hr className="border-gray-200" />

      <OptimizationSection />
    </div>
  );
}
