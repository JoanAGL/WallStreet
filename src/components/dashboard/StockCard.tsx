import type { StockWithAnalysis, InvestmentHorizon } from "@/types/models";
import { HORIZON_LABELS } from "@/types/models";
import { calculateRiskLevel } from "@/lib/riskCalculator";
import RiskBadge from "@/components/ui/RiskBadge";
import RemoveStockButton from "./RemoveStockButton";
import HorizonSelector from "./HorizonSelector";

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

function buildMetricsGrid(horizon: InvestmentHorizon, a: StockWithAnalysis["analysis"]): MetricEntry[] {
  if (!a) return [];

  let extra: Record<string, number | null> = {};
  if (a.metricsData) {
    try { extra = JSON.parse(a.metricsData); } catch { /* ignore */ }
  }

  if (horizon === "SHORT_TERM") {
    return [
      { label: "SMA 20",   value: fmt(a.sma20) },
      { label: "SMA 50",   value: fmt(a.sma50) },
      { label: "RSI 14",   value: fmt(a.rsi14) },
      { label: "ATR 14",   value: fmt(extra.atr14 ?? null) },
      { label: "Vol. Rel.", value: extra.relVolume != null ? `${fmt(extra.relVolume)}x` : "—" },
    ];
  }

  if (horizon === "MEDIUM_TERM") {
    return [
      { label: "Rev. Growth",  value: fmtPct(extra.revenueGrowthYoY ?? null) },
      { label: "EPS Fwd",      value: fmt(extra.forwardEps ?? null) },
      { label: "PEG Ratio",    value: fmt(extra.pegRatio ?? null) },
      { label: "Deuda/Capital",value: fmt(extra.debtToEquity ?? null) },
      { label: "ROE",          value: fmtPct(extra.returnOnEquity ?? null) },
    ];
  }

  // LONG_TERM
  return [
    { label: "P/E Trailing",  value: fmt(extra.trailingPE ?? null) },
    { label: "Div. Yield",    value: fmtPct(extra.dividendYield ?? null) },
    { label: "Margen Neto",   value: fmtPct(extra.profitMargin ?? null) },
    { label: "FCF Yield",     value: fmtPct(extra.freeCashflowYield ?? null) },
    { label: "Beta",          value: fmt(extra.beta ?? null) },
  ];
}

export default function StockCard({ stock }: Props) {
  const a = stock.analysis;
  const horizon = stock.investmentHorizon;
  const isPartialAnalysis = a?.scenarioJustification === AI_UNAVAILABLE_JUSTIFICATION;

  const riskLevel = a && !isPartialAnalysis
    ? calculateRiskLevel(a.rsi14, a.scenarioLabel, a.newsSentiment)
    : null;

  const changeColor = a && a.changePercent >= 0 ? "text-green-600" : "text-red-600";
  const sentimentClass = a ? (SENTIMENT_COLORS[a.scenarioLabel] ?? SENTIMENT_COLORS["Neutral"]) : "";

  const metricsGrid = buildMetricsGrid(horizon, a);

  let keyMetrics: string[] = [];
  if (a?.keyMetrics && !isPartialAnalysis) {
    try { keyMetrics = JSON.parse(a.keyMetrics); } catch { /* ignore */ }
  }

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

          {/* Banner análisis parcial */}
          {isPartialAnalysis ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 italic">
              Análisis de IA no disponible temporalmente. Pulsa «Actualizar datos» cuando la cuota se haya recuperado.
            </div>
          ) : (
            <>
              {/* Alerta de divergencia */}
              {a.divergenceAlert && (
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
                <span className="font-semibold">
                  Escenario {a.scenarioLabel}:
                </span>{" "}
                {a.scenarioJustification}
              </div>

              {/* Análisis IA */}
              <p className="text-sm text-gray-700 leading-relaxed">{a.analysisText}</p>

              {/* Encaje con horizonte */}
              {a.horizonMatch && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  <span className="font-semibold">Encaje con {HORIZON_LABELS[horizon]}:</span>{" "}
                  {a.horizonMatch}
                </div>
              )}

              {/* Key metrics chips */}
              {keyMetrics.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {keyMetrics.map((m) => (
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

          {/* Timestamp */}
          <p className="text-xs text-gray-400 text-right">
            Actualizado: {new Date(a.updatedAt).toLocaleString("es-ES")}
          </p>
        </>
      )}
    </div>
  );
}
