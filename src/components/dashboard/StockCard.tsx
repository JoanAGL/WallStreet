import type { StockWithAnalysis, InvestmentHorizon } from "@/types/models";
import { HORIZON_LABELS } from "@/types/models";
import type { HorizonAnalysis, AllHorizonsAIAnalysis } from "@/services/aiAnalysisService";
import { calculateRiskLevel } from "@/lib/riskCalculator";
import RiskBadge from "@/components/ui/RiskBadge";
import RemoveStockButton from "./RemoveStockButton";
import HorizonSelector from "./HorizonSelector";
import PurchaseDataEditor from "./PurchaseDataEditor";
import Link from "next/link";

interface Props {
  stock: StockWithAnalysis;
}

const SENTIMENT_COLORS: Record<string, string> = {
  Positivo: "text-green-700 bg-green-50 border-green-200",
  Neutral: "text-yellow-700 bg-yellow-50 border-yellow-200",
  Negativo: "text-red-700 bg-red-50 border-red-200",
};

const AI_UNAVAILABLE_JUSTIFICATION = "El análisis automático no está disponible en este momento.";

function fmt(n: number | null, decimals = 2): string {
  return n !== null ? n.toFixed(decimals) : "—";
}

function fmtPct(n: number | null): string {
  return n !== null ? `${(n * 100).toFixed(1)}%` : "—";
}

type MetricEntry = { label: string; value: string };

function parseAllHorizons(raw: string | null): AllHorizonsAIAnalysis | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as AllHorizonsAIAnalysis; } catch { return null; }
}

function getHorizonAI(all: AllHorizonsAIAnalysis, horizon: InvestmentHorizon): HorizonAnalysis {
  if (horizon === "MEDIUM_TERM") return all.mediumTerm;
  if (horizon === "LONG_TERM")   return all.longTerm;
  return all.shortTerm;
}

function getStoredHorizon(metricsData: string | null): InvestmentHorizon | null {
  if (!metricsData) return null;
  try {
    const m = JSON.parse(metricsData) as Record<string, unknown>;
    if (typeof m._horizon === "string") return m._horizon as InvestmentHorizon;
    if ("trailingPE" in m) return "LONG_TERM";
    if ("revenueGrowthYoY" in m) return "MEDIUM_TERM";
    return "SHORT_TERM";
  } catch { return null; }
}

type MetricsMap = Record<string, number | null>;

function parseMetricsData(raw: string | null): { short: MetricsMap; medium: MetricsMap; long: MetricsMap } {
  const empty = { short: {}, medium: {}, long: {} };
  if (!raw) return empty;
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    // New nested structure
    if (p.short !== undefined || p.medium !== undefined || p.long !== undefined) {
      return {
        short:  (p.short  as MetricsMap) ?? {},
        medium: (p.medium as MetricsMap) ?? {},
        long:   (p.long   as MetricsMap) ?? {},
      };
    }
    // Legacy flat structure — best-effort map
    return { short: p as MetricsMap, medium: p as MetricsMap, long: p as MetricsMap };
  } catch { return empty; }
}

function buildMetricsGrid(horizon: InvestmentHorizon, a: StockWithAnalysis["analysis"]): MetricEntry[] {
  if (!a) return [];
  const { short, medium, long } = parseMetricsData(a.metricsData);

  if (horizon === "SHORT_TERM") {
    return [
      { label: "SMA 20",    value: fmt(a.sma20) },
      { label: "SMA 50",    value: fmt(a.sma50) },
      { label: "RSI 14",    value: fmt(a.rsi14) },
      { label: "ATR 14",    value: fmt(short.atr14 ?? null) },
      { label: "Vol. Rel.", value: short.relVolume != null ? `${fmt(short.relVolume)}x` : "—" },
    ];
  }

  if (horizon === "MEDIUM_TERM") {
    return [
      { label: "Rev. Growth",   value: fmtPct(medium.revenueGrowthYoY ?? null) },
      { label: "EPS Fwd",       value: fmt(medium.forwardEps ?? null) },
      { label: "PEG Ratio",     value: fmt(medium.pegRatio ?? null) },
      { label: "Deuda/Capital", value: fmt(medium.debtToEquity ?? null) },
      { label: "ROE",           value: fmtPct(medium.returnOnEquity ?? null) },
    ];
  }

  return [
    { label: "P/E Trailing", value: fmt(long.trailingPE ?? null) },
    { label: "Div. Yield",   value: fmtPct(long.dividendYield ?? null) },
    { label: "Margen Neto",  value: fmtPct(long.profitMargin ?? null) },
    { label: "FCF Yield",    value: fmtPct(long.freeCashflowYield ?? null) },
    { label: "Beta",         value: fmt(long.beta ?? null) },
  ];
}

export default function StockCard({ stock }: Props) {
  const a = stock.analysis;
  const horizon = stock.investmentHorizon;
  const isPartialAnalysis = a?.scenarioJustification === AI_UNAVAILABLE_JUSTIFICATION;

  // Multi-horizon AI: use allHorizons when available, fall back to individual fields
  const allHorizonsData = parseAllHorizons(a?.allHorizons ?? null);
  const horizonAI = allHorizonsData ? getHorizonAI(allHorizonsData, horizon) : null;

  // Only show stale banner when allHorizons is not available (old records)
  const storedHorizon = getStoredHorizon(a?.metricsData ?? null);
  const isStaleHorizon = !allHorizonsData && !isPartialAnalysis && a !== null
    && storedHorizon !== null && storedHorizon !== horizon;

  // Resolve display values: prefer horizonAI, else fall back to DB fields
  const displayScenarioLabel    = (horizonAI?.scenarioLabel    ?? a?.scenarioLabel    ?? "Neutral") as "Positivo" | "Neutral" | "Negativo";
  const displayScenarioJust     = horizonAI?.scenarioJustification ?? a?.scenarioJustification ?? "";
  const displayAnalysisText     = horizonAI?.analysisText          ?? a?.analysisText          ?? "";
  const displayDivergenceAlert  = horizonAI?.divergenceAlert       ?? a?.divergenceAlert       ?? false;
  const displayHorizonMatch     = horizonAI?.horizonMatch          ?? a?.horizonMatch          ?? "";
  const displayKeyMetrics: string[] = horizonAI?.keyMetrics
    ?? (() => { try { return a?.keyMetrics ? JSON.parse(a.keyMetrics) as string[] : []; } catch { return []; } })();

  const riskLevel = a && !isPartialAnalysis
    ? calculateRiskLevel(a.rsi14, displayScenarioLabel, a.newsSentiment)
    : null;

  const changeColor = a && a.changePercent >= 0 ? "text-green-600" : "text-red-600";
  const sentimentClass = SENTIMENT_COLORS[displayScenarioLabel] ?? SENTIMENT_COLORS["Neutral"];

  const metricsGrid = buildMetricsGrid(horizon, a);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-gray-900">{stock.ticker}</h3>
            <span className="text-xs text-gray-400 font-medium">{HORIZON_LABELS[horizon]}</span>
          </div>
          {a && (
            <p className="text-2xl font-semibold text-gray-800 mt-0.5">
              ${fmt(a.price)}{" "}
              <span className={`text-sm font-medium ${changeColor}`}>
                {a.changePercent >= 0 ? "+" : ""}
                {fmt(a.changePercent)}%
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {riskLevel && <RiskBadge level={riskLevel} />}
          <RemoveStockButton ticker={stock.ticker} />
        </div>
      </div>

      {/* Horizon selector */}
      <HorizonSelector ticker={stock.ticker} current={horizon} />

      {!a && (
        <p className="text-sm text-gray-500 italic">
          Sin análisis disponible. Pulsa «Actualizar datos».
        </p>
      )}

      {a && (
        <>
          {/* Métricas según horizonte */}
          <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-5">
            {metricsGrid.map(({ label, value }) => (
              <div
                key={label}
                className="bg-gray-50 rounded-lg py-2 px-2 border border-gray-100"
              >
                <p className="text-xs text-gray-500 truncate">{label}</p>
                <p className="text-sm font-semibold text-gray-800">{value}</p>
              </div>
            ))}
          </div>

          {/* Banner horizonte obsoleto (solo para registros sin allHorizons) */}
          {isStaleHorizon && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
              Los datos guardados son de <span className="font-semibold">{HORIZON_LABELS[storedHorizon!]}</span>.
              Pulsa «Actualizar datos» para analizar en <span className="font-semibold">{HORIZON_LABELS[horizon]}</span>.
            </div>
          )}

          {/* Banner análisis parcial */}
          {isPartialAnalysis ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 italic">
              Análisis de IA no disponible temporalmente. Pulsa «Actualizar datos» cuando la cuota se haya recuperado.
            </div>
          ) : (
            <>
              {/* Alerta de divergencia */}
              {displayDivergenceAlert && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <span className="mt-0.5 shrink-0">⚠</span>
                  <span>
                    <span className="font-semibold">Divergencia técnico-fundamental detectada.</span>{" "}
                    Los indicadores técnicos y el sentimiento noticioso apuntan en direcciones opuestas.
                  </span>
                </div>
              )}

              {/* Escenario */}
              <div className={`rounded-lg border px-3 py-2 text-sm ${sentimentClass}`}>
                <span className="font-semibold">Escenario {displayScenarioLabel}:</span>{" "}
                {displayScenarioJust}
              </div>

              {/* Análisis IA */}
              <p className="text-sm text-gray-700 leading-relaxed">{displayAnalysisText}</p>

              {/* Encaje con horizonte */}
              {displayHorizonMatch && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  <span className="font-semibold">Encaje con {HORIZON_LABELS[horizon]}:</span>{" "}
                  {displayHorizonMatch}
                </div>
              )}

              {/* Key metrics chips */}
              {displayKeyMetrics.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {displayKeyMetrics.map((m) => (
                    <span
                      key={m}
                      className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Noticias */}
          {a.newsSummary !== "Resumen de noticias no disponible." && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-medium text-gray-500 mb-1">
                Noticias recientes · Sentimiento:{" "}
                <span
                  className={
                    a.newsSentiment === "Positivo"
                      ? "text-green-600"
                      : a.newsSentiment === "Negativo"
                      ? "text-red-600"
                      : "text-yellow-600"
                  }
                >
                  {a.newsSentiment}
                </span>
              </p>
              <p className="text-xs text-gray-600 leading-relaxed">{a.newsSummary}</p>
            </div>
          )}

          {/* Mi posición (P&L) */}
          {(() => {
            const hasPurchase = stock.purchasePrice != null && stock.quantity != null;
            const costBasis   = hasPurchase ? stock.purchasePrice! * stock.quantity! : null;
            const currentVal  = hasPurchase ? a.price * stock.quantity! : null;
            const pnl         = costBasis != null && currentVal != null ? currentVal - costBasis : null;
            const pnlPct      = pnl != null && costBasis && costBasis !== 0 ? (pnl / costBasis) * 100 : null;
            const pnlColor    = pnl != null && pnl >= 0 ? "text-green-600" : "text-red-600";
            const fmtMoney    = (n: number) =>
              n.toLocaleString("es-ES", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

            return (
              <div className="border-t border-gray-100 pt-3 space-y-2">
                {hasPurchase && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-gray-50 rounded-lg py-2 px-2 border border-gray-100">
                      <p className="text-xs text-gray-500">Invertido</p>
                      <p className="text-sm font-semibold text-gray-800">{fmtMoney(costBasis!)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg py-2 px-2 border border-gray-100">
                      <p className="text-xs text-gray-500">Valor actual</p>
                      <p className="text-sm font-semibold text-gray-800">{fmtMoney(currentVal!)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg py-2 px-2 border border-gray-100">
                      <p className="text-xs text-gray-500">P&L</p>
                      <p className={`text-sm font-semibold ${pnlColor}`}>
                        {pnl != null && pnl >= 0 ? "+" : ""}
                        {pnl != null ? fmtMoney(pnl) : "—"}
                      </p>
                      {pnlPct != null && (
                        <p className={`text-xs ${pnlColor}`}>
                          {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                        </p>
                      )}
                    </div>
                  </div>
                )}
                <PurchaseDataEditor
                  ticker={stock.ticker}
                  purchasePrice={stock.purchasePrice}
                  quantity={stock.quantity}
                  purchaseDate={stock.purchaseDate ? stock.purchaseDate.toISOString() : null}
                />
              </div>
            );
          })()}

          {/* Footer: timestamp + enlace historial */}
          <div className="flex items-center justify-between">
            <Link
              href={`/dashboard/${stock.ticker}`}
              className="text-xs text-blue-500 hover:text-blue-700 hover:underline"
            >
              Ver historial →
            </Link>
            <p className="text-xs text-gray-400">
              Actualizado: {new Date(a.updatedAt).toLocaleString("es-ES")}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
