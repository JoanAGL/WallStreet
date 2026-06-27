import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { findStockByTickerAndUser } from "@/repositories/stockRepository";
import { getStockHistory } from "@/repositories/analysisHistoryRepository";
import { HORIZON_LABELS } from "@/types/models";
import type { InvestmentHorizon } from "@/types/models";
import PriceChart from "@/components/dashboard/PriceChart";
import FinancialsTable from "@/components/dashboard/FinancialsTable";
import EarningsChart from "@/components/dashboard/EarningsChart";
import PeerComparison from "@/components/dashboard/PeerComparison";
import { resolveSector } from "@/lib/sectorUtils";
import {
  fetchStockProfile,
  fetchStockMetrics,
  fetchStockRecommendations,
} from "@/lib/finnhubClient";
import { fetchYahooCandles } from "@/lib/yahooFinanceClient";

export const dynamic = "force-dynamic";

const NON_EQUITY_SECTORS = new Set([
  "ETF EE.UU.", "ETF Europa", "ETF Global", "Renta Fija",
  "Cripto", "Materias Primas", "Índice",
]);

const SCENARIO_COLORS: Record<string, string> = {
  Positivo: "text-green-700 bg-green-50 border-green-200",
  Neutral:  "text-yellow-700 bg-yellow-50 border-yellow-200",
  Negativo: "text-red-700 bg-red-50 border-red-200",
};

interface Props {
  params: { ticker: string };
}

// ── Risk metrics from historical closes ──────────────────────────────────────

function computeRiskMetrics(closes: number[], timestamps: number[]) {
  if (closes.length < 20) return null;

  // Max drawdown
  let peak = closes[0];
  let maxDD = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    const dd = (peak - c) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  // Best / worst year by calendar year
  const byYear: Record<number, number[]> = {};
  timestamps.forEach((ts, i) => {
    const yr = new Date(ts * 1000).getFullYear();
    if (!byYear[yr]) byYear[yr] = [];
    if (closes[i] != null) byYear[yr].push(closes[i]);
  });

  let bestYear: { year: number; pct: number } | null = null;
  let worstYear: { year: number; pct: number } | null = null;

  for (const [yr, prices] of Object.entries(byYear)) {
    if (prices.length < 5) continue;
    const pct = ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;
    const y = Number(yr);
    if (!bestYear || pct > bestYear.pct) bestYear = { year: y, pct };
    if (!worstYear || pct < worstYear.pct) worstYear = { year: y, pct };
  }

  // % months positive (approximate from daily)
  let posMonths = 0;
  let totalMonths = 0;
  const monthKeys = Array.from(new Set(timestamps.map((ts) => {
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}-${d.getMonth()}`;
  })));
  for (const mk of monthKeys) {
    const [yr, mo] = mk.split("-").map(Number);
    const inMonth = timestamps
      .map((ts, i) => ({ ts, i }))
      .filter(({ ts }) => {
        const d = new Date(ts * 1000);
        return d.getFullYear() === yr && d.getMonth() === mo;
      });
    if (inMonth.length < 2) continue;
    const first = closes[inMonth[0].i];
    const last  = closes[inMonth[inMonth.length - 1].i];
    if (first > 0) {
      totalMonths++;
      if (last > first) posMonths++;
    }
  }
  const pctPositiveMonths = totalMonths > 0 ? (posMonths / totalMonths) * 100 : null;

  // Annualized return (full period)
  const totalReturn = (closes[closes.length - 1] - closes[0]) / closes[0];
  const years = (timestamps[timestamps.length - 1] - timestamps[0]) / (365.25 * 24 * 3600);
  const annualized = years > 0 ? (Math.pow(1 + totalReturn, 1 / years) - 1) * 100 : null;

  // Volatilidad anualizada
  const dailyRets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) dailyRets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const meanRet = dailyRets.reduce((s, v) => s + v, 0) / (dailyRets.length || 1);
  const variance = dailyRets.reduce((s, v) => s + (v - meanRet) ** 2, 0) / (dailyRets.length || 1);
  const volatilityAnnualized = Math.sqrt(variance) * Math.sqrt(252) * 100;

  // Sharpe Ratio (rf = 2%)
  const sharpeRatio =
    annualized != null && volatilityAnnualized > 0
      ? (annualized - 2) / volatilityAnnualized
      : null;

  return {
    maxDrawdownPct: maxDD * 100,
    bestYear,
    worstYear,
    pctPositiveMonths,
    annualizedPct: annualized,
    volatilityAnnualized,
    sharpeRatio,
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function TickerDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const ticker = params.ticker.toUpperCase();
  const stock = await findStockByTickerAndUser(ticker, session.user.id);
  if (!stock) notFound();

  const [history, profile, metrics, recommendations, candles] = await Promise.allSettled([
    getStockHistory(stock.id, 30),
    fetchStockProfile(ticker),
    fetchStockMetrics(ticker),
    fetchStockRecommendations(ticker),
    fetchYahooCandles(ticker, 250),
  ]);

  const h          = history.status === "fulfilled"        ? history.value         : [];
  const prof       = profile.status === "fulfilled"        ? profile.value         : null;
  const met        = metrics.status === "fulfilled"        ? metrics.value         : null;
  const recs       = recommendations.status === "fulfilled" ? recommendations.value : [];
  const candleData = candles.status === "fulfilled"        ? candles.value         : null;

  const latestRec = recs[0] ?? null;
  const recTotal  = latestRec
    ? latestRec.strongBuy + latestRec.buy + latestRec.hold + latestRec.sell + latestRec.strongSell
    : 0;

  const riskMetrics = candleData ? computeRiskMetrics(candleData.closes, candleData.timestamps) : null;

  const fmt = (n: number | null, decimals = 2, suffix = "") =>
    n != null ? `${n.toFixed(decimals)}${suffix}` : "—";
  const fmtMult = (n: number | null) => n != null ? `${n.toFixed(2)}x` : "—";

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
          ← Dashboard
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">{ticker}</h1>
        {prof?.name && <span className="text-sm text-gray-400">{prof.name}</span>}
        {prof?.finnhubIndustry && (
          <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5">
            {prof.finnhubIndustry}
          </span>
        )}
      </div>

      {/* Company description */}
      {prof?.description && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Descripción</p>
          <p className="text-sm text-gray-600 leading-relaxed line-clamp-4">{prof.description}</p>
          {prof.weburl && (
            <a href={prof.weburl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline mt-1 inline-block">
              {prof.weburl} ↗
            </a>
          )}
        </div>
      )}

      {/* Risk metrics */}
      {riskMetrics && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Rentabilidad y riesgo histórica
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Volatilidad — semáforo: verde <20%, amarillo 20-40%, rojo >40% */}
            <RiskCell
              label="Volatilidad anualizada"
              value={`${riskMetrics.volatilityAnnualized.toFixed(1)}%`}
              valueClass={
                riskMetrics.volatilityAnnualized < 20
                  ? "text-green-600 font-bold"
                  : riskMetrics.volatilityAnnualized < 40
                  ? "text-yellow-600 font-bold"
                  : "text-red-600 font-bold"
              }
            />
            {/* Max Drawdown — semáforo: verde <15%, amarillo 15-30%, rojo >30% */}
            <RiskCell
              label="Caída máxima (drawdown)"
              value={`-${fmt(riskMetrics.maxDrawdownPct)}%`}
              valueClass={
                riskMetrics.maxDrawdownPct < 15
                  ? "text-green-600 font-bold"
                  : riskMetrics.maxDrawdownPct < 30
                  ? "text-yellow-600 font-bold"
                  : "text-red-600 font-bold"
              }
            />
            {/* Sharpe — semáforo: verde >1, amarillo 0.5-1, rojo <0.5 */}
            {riskMetrics.sharpeRatio != null && (
              <RiskCell
                label="Sharpe Ratio (rf=2%)"
                value={riskMetrics.sharpeRatio.toFixed(2)}
                valueClass={
                  riskMetrics.sharpeRatio > 1
                    ? "text-green-600 font-bold"
                    : riskMetrics.sharpeRatio >= 0.5
                    ? "text-yellow-600 font-bold"
                    : "text-red-600 font-bold"
                }
              />
            )}
            <RiskCell label="Mejor año"
              value={riskMetrics.bestYear ? `${riskMetrics.bestYear.year}: +${riskMetrics.bestYear.pct.toFixed(1)}%` : "—"}
              valueClass="text-green-600 font-bold" />
            <RiskCell label="Peor año"
              value={riskMetrics.worstYear ? `${riskMetrics.worstYear.year}: ${riskMetrics.worstYear.pct.toFixed(1)}%` : "—"}
              valueClass="text-red-600 font-bold" />
            {riskMetrics.annualizedPct != null && (
              <RiskCell label="Retorno anualizado"
                value={`${riskMetrics.annualizedPct >= 0 ? "+" : ""}${riskMetrics.annualizedPct.toFixed(2)}%`}
                valueClass={riskMetrics.annualizedPct >= 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"} />
            )}
            {riskMetrics.pctPositiveMonths != null && (
              <RiskCell label="Meses en positivo"
                value={`${riskMetrics.pctPositiveMonths.toFixed(0)}%`}
                valueClass="text-gray-800 font-bold" />
            )}
            {met?.beta != null && (
              <RiskCell label="Beta (vs mercado)"
                value={fmt(met.beta)}
                valueClass="text-gray-800 font-bold" />
            )}
          </div>
        </div>
      )}

      {/* Fundamental ratios */}
      {met && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Valoración y ratios fundamentales
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <MetricCell label="PER" value={fmtMult(met.peNormalizedAnnual)} />
            <MetricCell label="P/Valor contable" value={fmtMult(met.pbAnnual)} />
            <MetricCell label="P/Ventas (TTM)" value={fmtMult(met.psTTM)} />
            <MetricCell label="ROE (TTM)" value={fmt(met.roeTTM != null ? met.roeTTM * 100 : null, 2, "%")} />
            <MetricCell label="ROA (TTM)" value={fmt(met.roaTTM != null ? met.roaTTM * 100 : null, 2, "%")} />
            <MetricCell label="Margen bruto" value={fmt(met.grossMarginTTM != null ? met.grossMarginTTM * 100 : null, 2, "%")} />
            <MetricCell label="Margen neto" value={fmt(met.netMarginTTM != null ? met.netMarginTTM * 100 : null, 2, "%")} />
            <MetricCell label="Crecim. ingresos" value={fmt(met.revenueGrowthTTMYoy != null ? met.revenueGrowthTTMYoy * 100 : null, 2, "%")} />
            <MetricCell label="Rentab. dividendo" value={fmt(met.dividendYieldIndicatedAnnual != null ? met.dividendYieldIndicatedAnnual * 100 : null, 2, "%")} />
            <MetricCell label="Deuda/Capital" value={fmt(met.debtEquityAnnual)} />
            <MetricCell label="Ratio corriente" value={fmt(met.currentRatioAnnual)} />
            <MetricCell label="52 semanas Alto/Bajo"
              value={met["52WeekHigh"] != null && met["52WeekLow"] != null
                ? `$${met["52WeekHigh"]!.toFixed(2)} / $${met["52WeekLow"]!.toFixed(2)}`
                : "—"} />
          </div>
        </div>
      )}

      {/* Analyst recommendations */}
      {latestRec && recTotal > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Recomendación de analistas
            </p>
            <span className="text-xs text-gray-400">{latestRec.period} · {recTotal} analistas</span>
          </div>

          {/* Bar */}
          <div className="flex rounded-lg overflow-hidden h-6 mb-3">
            {[
              { label: "Compra fuerte", count: latestRec.strongBuy,  color: "#16a34a" },
              { label: "Compra",        count: latestRec.buy,         color: "#4ade80" },
              { label: "Mantener",      count: latestRec.hold,        color: "#fbbf24" },
              { label: "Venta",         count: latestRec.sell,        color: "#f87171" },
              { label: "Venta fuerte",  count: latestRec.strongSell,  color: "#dc2626" },
            ]
              .filter((s) => s.count > 0)
              .map((s) => (
                <div
                  key={s.label}
                  style={{ width: `${(s.count / recTotal) * 100}%`, background: s.color }}
                  title={`${s.label}: ${s.count}`}
                />
              ))}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {[
              { label: "Compra fuerte", count: latestRec.strongBuy,  color: "text-green-700" },
              { label: "Compra",        count: latestRec.buy,         color: "text-green-500" },
              { label: "Mantener",      count: latestRec.hold,        color: "text-yellow-600" },
              { label: "Venta",         count: latestRec.sell,        color: "text-red-400" },
              { label: "Venta fuerte",  count: latestRec.strongSell,  color: "text-red-700" },
            ]
              .filter((s) => s.count > 0)
              .map((s) => (
                <span key={s.label} className={`text-xs font-medium ${s.color}`}>
                  {s.label}: {s.count}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Actuals & Consensus Estimates table */}
      <FinancialsTable ticker={ticker} />

      {/* Revenue / EBITDA / EPS chart */}
      <EarningsChart ticker={ticker} />

      {/* Peer comparison — not shown for ETFs, crypto, indices */}
      {!NON_EQUITY_SECTORS.has(stock.sector ?? resolveSector(stock.ticker) ?? "") && (
        <PeerComparison ticker={ticker} />
      )}

      {/* Price history chart */}
      {h.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-3">📋</p>
          <p className="text-sm">Aún no hay historial. Se generará a partir de la próxima actualización.</p>
        </div>
      ) : (
        <>
          {h.length >= 2 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Precio — últimas {h.length} sesiones
              </p>
              <PriceChart
                data={[...h].reverse().map((r) => ({
                  date:  new Date(r.snapshotAt).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }),
                  price: r.price,
                }))}
              />
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {["Fecha", "Precio", "Cambio", "Escenario", "RSI 14", "Horizonte"].map((col) => (
                      <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {h.map((row, i) => {
                    const isPositive = row.changePercent >= 0;
                    const scenarioClass = SCENARIO_COLORS[row.scenarioLabel] ?? SCENARIO_COLORS["Neutral"];
                    const horizonLabel  = HORIZON_LABELS[row.horizonUsed as InvestmentHorizon] ?? row.horizonUsed;
                    const isLatest      = i === 0;

                    return (
                      <tr key={row.id} className={isLatest ? "bg-blue-50/40" : "hover:bg-gray-50"}>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {new Date(row.snapshotAt).toLocaleString("es-ES", {
                            day: "2-digit", month: "2-digit", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                          {isLatest && <span className="ml-2 text-xs text-blue-600 font-medium">último</span>}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">${row.price.toFixed(2)}</td>
                        <td className={`px-4 py-3 font-medium ${isPositive ? "text-green-600" : "text-red-600"}`}>
                          {isPositive ? "+" : ""}{row.changePercent.toFixed(2)}%
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${scenarioClass}`}>
                            {row.scenarioLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {row.rsi14 != null ? row.rsi14.toFixed(1) : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{horizonLabel}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
              Mostrando los últimos {h.length} registros · máximo 30
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Layout helpers ─────────────────────────────────────────────────────────────

function RiskCell({ label, value, valueClass = "text-gray-800 font-bold" }: {
  label: string; value: string; valueClass?: string;
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-sm ${valueClass}`}>{value}</p>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-2.5">
      <p className="text-gray-400 mb-0.5 text-xs">{label}</p>
      <p className="text-gray-800 font-medium text-sm">{value}</p>
    </div>
  );
}
