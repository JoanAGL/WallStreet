import type { StockWithAnalysis } from "@/types/models";
import { calculateRiskLevel } from "@/lib/riskCalculator";
import RiskBadge from "@/components/ui/RiskBadge";
import RemoveStockButton from "./RemoveStockButton";

interface Props {
  stock: StockWithAnalysis;
}

const SENTIMENT_COLORS: Record<string, string> = {
  Positivo: "text-green-700 bg-green-50 border-green-200",
  Neutral: "text-yellow-700 bg-yellow-50 border-yellow-200",
  Negativo: "text-red-700 bg-red-50 border-red-200",
};

// Centinela que indica que el análisis IA no estaba disponible al actualizar
const AI_UNAVAILABLE_JUSTIFICATION = "El análisis automático no está disponible en este momento.";

function fmt(n: number | null, decimals = 2): string {
  return n !== null ? n.toFixed(decimals) : "—";
}

export default function StockCard({ stock }: Props) {
  const a = stock.analysis;
  const isPartialAnalysis = a?.scenarioJustification === AI_UNAVAILABLE_JUSTIFICATION;

  const riskLevel = a && !isPartialAnalysis
    ? calculateRiskLevel(a.rsi14, a.scenarioLabel, a.newsSentiment)
    : null;

  const changeColor =
    a && a.changePercent >= 0 ? "text-green-600" : "text-red-600";
  const sentimentClass =
    a ? (SENTIMENT_COLORS[a.scenarioLabel] ?? SENTIMENT_COLORS["Neutral"]) : "";

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{stock.ticker}</h3>
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
        <div className="flex items-center gap-2">
          {riskLevel && <RiskBadge level={riskLevel} />}
          <RemoveStockButton ticker={stock.ticker} />
        </div>
      </div>

      {!a && (
        <p className="text-sm text-gray-500 italic">
          Sin análisis disponible. Pulsa «Actualizar datos».
        </p>
      )}

      {a && (
        <>
          {/* Indicadores técnicos */}
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: "SMA 20", value: fmt(a.sma20) },
              { label: "SMA 50", value: fmt(a.sma50) },
              { label: "RSI 14", value: fmt(a.rsi14) },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="bg-gray-50 rounded-lg py-2 px-3 border border-gray-100"
              >
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-sm font-semibold text-gray-800">{value}</p>
              </div>
            ))}
          </div>

          {/* Banner análisis parcial (IA no disponible) */}
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
                  Escenario {a.scenarioLabel} (5-7 días):
                </span>{" "}
                {a.scenarioJustification}
              </div>

              {/* Análisis IA */}
              <p className="text-sm text-gray-700 leading-relaxed">{a.analysisText}</p>
            </>
          )}

          {/* Noticias (siempre visible si hay resumen real) */}
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
