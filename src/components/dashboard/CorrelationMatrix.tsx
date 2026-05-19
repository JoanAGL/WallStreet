"use client";

import { useEffect, useState } from "react";
import type { CorrelationResult } from "@/lib/portfolioMath";

function cellColor(v: number): string {
  if (v >= 1) return "bg-gray-100 text-gray-500";
  if (v > 0.7) return "bg-red-100 text-red-800 font-semibold";
  if (v > 0.4) return "bg-yellow-50 text-yellow-800";
  return "bg-green-50 text-green-800";
}

export default function CorrelationMatrix() {
  const [data, setData] = useState<CorrelationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portfolio/correlation")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d as CorrelationResult);
      })
      .catch(() => setError("Error al calcular la correlación."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Matriz de correlación</p>
        <div className="h-24 animate-pulse bg-gray-50 rounded-lg" />
      </div>
    );
  }

  if (error || !data || data.tickers.length < 2) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Matriz de correlación
        </p>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-200 inline-block" /> Baja (&lt;0.4)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-yellow-100 inline-block" /> Media</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-100 inline-block" /> Alta (&gt;0.7)</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr>
              <th className="p-1.5 text-left text-gray-400 font-normal w-12" />
              {data.tickers.map((t) => (
                <th key={t} className="p-1.5 text-center text-gray-600 font-semibold">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.matrix.map((row, i) => (
              <tr key={data.tickers[i]}>
                <td className="p-1.5 font-semibold text-gray-600">{data.tickers[i]}</td>
                {row.map((val, j) => (
                  <td
                    key={j}
                    className={`p-1.5 text-center rounded text-xs ${cellColor(val)}`}
                  >
                    {val.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.highPairs.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
          {data.highPairs.map((pair) => (
            <span
              key={`${pair.a}-${pair.b}`}
              className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700"
            >
              ⚠ {pair.a} y {pair.b} altamente correlacionados ({pair.correlation.toFixed(2)}) — considera diversificar
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
