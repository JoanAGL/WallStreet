import type { PortfolioAIAnalysis } from "@/services/portfolioAIService";
import RegeneratePortfolioButton from "./RegeneratePortfolioButton";

interface Props {
  analysisJson: string;
  stockCount:   number;
  updatedAt:    Date;
}

function parseSafe(json: string): PortfolioAIAnalysis | null {
  try { return JSON.parse(json) as PortfolioAIAnalysis; } catch { return null; }
}

const SENTIMENT_BADGE: Record<string, string> = {
  Optimista:   "bg-green-100 text-green-700 border-green-200",
  Neutro:      "bg-yellow-100 text-yellow-700 border-yellow-200",
  Conservador: "bg-red-100 text-red-700 border-red-200",
};

const RISK_BADGE: Record<string, string> = {
  Bajo:     "bg-green-100 text-green-700 border-green-200",
  Moderado: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Alto:     "bg-red-100 text-red-700 border-red-200",
};

function ScoreBar({ score }: { score: number }) {
  const pct = `${(score / 10) * 100}%`;
  const color =
    score >= 7 ? "bg-green-500" :
    score >= 4 ? "bg-yellow-500" :
    "bg-red-500";
  return (
    <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: pct }} />
    </div>
  );
}

export default function PortfolioAIInsights({ analysisJson, stockCount, updatedAt }: Props) {
  const a = parseSafe(analysisJson);
  if (!a) return null;

  const sentimentBadge = SENTIMENT_BADGE[a.overallSentiment] ?? SENTIMENT_BADGE["Neutro"];
  const riskBadge      = RISK_BADGE[a.riskProfile]           ?? RISK_BADGE["Moderado"];

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-gray-700">
          Análisis global de cartera
          <span className="ml-1.5 text-xs font-normal text-gray-400">
            · {stockCount} acciones
          </span>
        </p>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${sentimentBadge}`}>
            {a.overallSentiment}
          </span>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${riskBadge}`}>
            Riesgo {a.riskProfile}
          </span>
        </div>
      </div>

      {/* Diversification score */}
      <div>
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span className="font-medium">Diversificación</span>
          <span>{a.diversificationScore.toFixed(1)} / 10</span>
        </div>
        <ScoreBar score={a.diversificationScore} />
        {a.diversificationComment && (
          <p className="text-xs text-gray-500 mt-1">{a.diversificationComment}</p>
        )}
      </div>

      {/* Summary */}
      <p className="text-sm text-gray-700 leading-relaxed">{a.portfolioSummaryText}</p>

      {/* Sector concentration */}
      {a.sectorConcentration && (
        <p className="text-xs text-gray-500 italic">{a.sectorConcentration}</p>
      )}

      {/* Opportunities & Risks */}
      {(a.keyOpportunities.length > 0 || a.keyRisks.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {a.keyOpportunities.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-green-700 mb-1">Oportunidades</p>
              <ul className="space-y-0.5">
                {a.keyOpportunities.map((o) => (
                  <li key={o} className="text-xs text-gray-600">• {o}</li>
                ))}
              </ul>
            </div>
          )}
          {a.keyRisks.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-700 mb-1">Riesgos</p>
              <ul className="space-y-0.5">
                {a.keyRisks.map((r) => (
                  <li key={r} className="text-xs text-gray-600">• {r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Rebalancing hint */}
      {a.rebalancingHint && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <span className="font-semibold">Rebalanceo:</span> {a.rebalancingHint}
        </div>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        <RegeneratePortfolioButton />
        <p className="text-xs text-gray-400">
          Actualizado: {new Date(updatedAt).toLocaleString("es-ES")}
        </p>
      </div>
    </div>
  );
}
