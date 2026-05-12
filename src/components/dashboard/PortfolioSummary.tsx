import type { StockWithAnalysis } from "@/types/models";
import type { AllHorizonsAIAnalysis } from "@/services/aiAnalysisService";

interface Props {
  stocks: StockWithAnalysis[];
}

function getActiveScenario(stock: StockWithAnalysis): "Positivo" | "Neutral" | "Negativo" {
  const a = stock.analysis;
  if (!a) return "Neutral";

  if (a.allHorizons) {
    try {
      const all = JSON.parse(a.allHorizons) as AllHorizonsAIAnalysis;
      const key =
        stock.investmentHorizon === "MEDIUM_TERM" ? "mediumTerm" :
        stock.investmentHorizon === "LONG_TERM"   ? "longTerm"   : "shortTerm";
      const label = all[key]?.scenarioLabel;
      if (label === "Positivo" || label === "Negativo") return label;
    } catch { /* ignore */ }
  }

  const label = a.scenarioLabel;
  if (label === "Positivo" || label === "Negativo") return label;
  return "Neutral";
}

function fmtMoney(n: number): string {
  return n.toLocaleString("es-ES", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

export default function PortfolioSummary({ stocks }: Props) {
  const withAnalysis = stocks.filter((s) => s.analysis);
  if (withAnalysis.length < 2) return null;

  const positivo    = withAnalysis.filter((s) => getActiveScenario(s) === "Positivo").length;
  const negativo    = withAnalysis.filter((s) => getActiveScenario(s) === "Negativo").length;
  const neutral     = withAnalysis.length - positivo - negativo;
  const divergencias = withAnalysis.filter((s) => s.analysis?.divergenceAlert).length;
  const avgChange   = withAnalysis.reduce((sum, s) => sum + (s.analysis?.changePercent ?? 0), 0) / withAnalysis.length;

  // Aggregate P&L across positions with purchase data
  const withPosition = withAnalysis.filter(
    (s) => s.purchasePrice != null && s.quantity != null
  );
  const totalCost    = withPosition.reduce((sum, s) => sum + s.purchasePrice! * s.quantity!, 0);
  const totalValue   = withPosition.reduce((sum, s) => sum + (s.analysis?.price ?? 0) * s.quantity!, 0);
  const totalPnl     = withPosition.length > 0 ? totalValue - totalCost : null;
  const totalPnlPct  = totalPnl != null && totalCost > 0 ? (totalPnl / totalCost) * 100 : null;
  const pnlColor     = totalPnl != null && totalPnl >= 0 ? "text-green-600" : "text-red-600";

  const overallColor =
    positivo > negativo ? "border-green-200 bg-green-50" :
    negativo > positivo ? "border-red-200 bg-red-50"     :
    "border-gray-200 bg-gray-50";

  return (
    <div className={`rounded-xl border px-4 py-3 space-y-2 ${overallColor}`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Resumen de cartera
      </p>

      {/* Scenario distribution + daily change */}
      <div className="flex flex-wrap items-center gap-2">
        {positivo > 0 && (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
            {positivo} Positivo{positivo > 1 ? "s" : ""}
          </span>
        )}
        {neutral > 0 && (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 border border-yellow-200">
            {neutral} Neutral{neutral > 1 ? "es" : ""}
          </span>
        )}
        {negativo > 0 && (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
            {negativo} Negativo{negativo > 1 ? "s" : ""}
          </span>
        )}

        <span className="text-xs text-gray-400">·</span>
        <span className={`text-sm font-semibold ${avgChange >= 0 ? "text-green-600" : "text-red-600"}`}>
          {avgChange >= 0 ? "+" : ""}{avgChange.toFixed(2)}% hoy
        </span>

        {divergencias > 0 && (
          <>
            <span className="text-xs text-gray-400">·</span>
            <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
              ⚠ {divergencias} divergencia{divergencias > 1 ? "s" : ""}
            </span>
          </>
        )}
      </div>

      {/* Aggregate P&L (only when at least 1 position has purchase data) */}
      {totalPnl != null && (
        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-black/5 text-xs">
          <span className="text-gray-500">
            Invertido: <span className="font-medium text-gray-700">{fmtMoney(totalCost)}</span>
          </span>
          <span className="text-gray-500">
            Valor: <span className="font-medium text-gray-700">{fmtMoney(totalValue)}</span>
          </span>
          <span className={`font-semibold ${pnlColor}`}>
            P&L: {totalPnl >= 0 ? "+" : ""}{fmtMoney(totalPnl)}
            {totalPnlPct != null && (
              <span className="ml-1 font-normal">
                ({totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%)
              </span>
            )}
          </span>
          {withPosition.length < withAnalysis.length && (
            <span className="text-gray-400 italic">
              · {withPosition.length}/{withAnalysis.length} posiciones
            </span>
          )}
        </div>
      )}
    </div>
  );
}
