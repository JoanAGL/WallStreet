import type { EquityCurve as EquityCurveData } from "@/services/portfolioSnapshotService";

interface Props {
  curve: EquityCurveData;
}

const W = 720;
const H = 180;
const PAD = { top: 10, right: 8, bottom: 22, left: 56 };

function fmtUSD(n: number): string {
  return n.toLocaleString("es-ES", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/**
 * Curva de evolución del valor de cartera (verde) frente al coste base (gris),
 * construida con los snapshots diarios. SVG servidor-compatible, sin deps.
 */
export default function EquityCurve({ curve }: Props) {
  const { points, twrPct, twrAnnualized, spanDays } = curve;

  if (points.length < 2) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Evolución de cartera</p>
        <p className="mt-2 text-sm text-gray-500">
          La curva se construye con un snapshot por día (se captura en cada actualización de datos).
          {points.length === 1 ? " Ya hay un punto registrado — vuelve mañana." : " Aún no hay puntos registrados."}
        </p>
      </div>
    );
  }

  const values = points.flatMap((p) => [p.totalValue, p.costBasis]);
  const min = Math.min(...values) * 0.98;
  const max = Math.max(...values) * 1.02;
  const range = max - min || 1;

  const x = (i: number) => PAD.left + (i / (points.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - min) / range) * (H - PAD.top - PAD.bottom);

  const line = (key: "totalValue" | "costBasis") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");

  const last = points[points.length - 1];
  const first = points[0];
  const gridYs = [0, 0.5, 1].map((t) => min + t * range);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Evolución de cartera <span className="normal-case font-normal">· {first.date} → {last.date} ({spanDays}d)</span>
        </p>
        <div className="flex items-baseline gap-4 text-xs">
          {twrPct != null && (
            <span className="text-gray-600">
              TWR: <strong className={twrPct >= 0 ? "text-green-600" : "text-red-600"}>
                {twrPct >= 0 ? "+" : ""}{twrPct.toFixed(2)}%
              </strong>
            </span>
          )}
          {twrAnnualized != null && (
            <span className="text-gray-600">
              Anualizado: <strong className={twrAnnualized >= 0 ? "text-green-600" : "text-red-600"}>
                {twrAnnualized >= 0 ? "+" : ""}{twrAnnualized.toFixed(2)}%
              </strong>
            </span>
          )}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label="Evolución del valor de cartera frente al coste base">
        {gridYs.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)}
              stroke="currentColor" className="text-slate-200" strokeWidth="1" strokeDasharray="3 4" />
            <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" fontSize="10"
              className="fill-gray-400">{fmtUSD(v)}</text>
          </g>
        ))}
        <path d={line("costBasis")} fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="5 4" />
        <path d={line("totalValue")} fill="none" stroke="#16A34A" strokeWidth="2" />
        <circle cx={x(points.length - 1)} cy={y(last.totalValue)} r="3" fill="#16A34A" />
        <text x={PAD.left} y={H - 6} fontSize="10" className="fill-gray-400">{first.date}</text>
        <text x={W - PAD.right} y={H - 6} fontSize="10" textAnchor="end" className="fill-gray-400">{last.date}</text>
      </svg>

      <p className="text-[11px] text-gray-400">
        <span className="text-green-600">━</span> Valor de mercado ·{" "}
        <span className="text-slate-400">╌</span> Coste base · El TWR neutraliza aportaciones y
        retiradas: mide rentabilidad, no tamaño de las aportaciones.
      </p>
    </div>
  );
}
