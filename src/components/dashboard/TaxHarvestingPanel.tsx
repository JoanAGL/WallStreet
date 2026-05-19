import type { StockWithAnalysis } from "@/types/models";
import { detectHarvestOpportunities } from "@/lib/portfolioMath";

interface Props {
  stocks: StockWithAnalysis[];
}

function fmtMoney(n: number): string {
  return Math.abs(n).toLocaleString("es-ES", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

export default function TaxHarvestingPanel({ stocks }: Props) {
  const candidates = stocks
    .filter((s) => s.analysis)
    .map((s) => ({
      ticker: s.ticker,
      purchasePrice: s.purchasePrice,
      currentPrice: s.analysis!.price,
      quantity: s.quantity,
    }));

  const alerts = detectHarvestOpportunities(candidates);
  if (alerts.length === 0) return null;

  const totalLoss = alerts.reduce((sum, a) => sum + a.latentLoss, 0);

  return (
    <div className="bg-white border border-amber-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
            ⚠ Tax Harvesting
          </p>
          <p className="text-sm text-gray-700 mt-0.5">
            Tienes <span className="font-semibold text-red-600">{fmtMoney(totalLoss)}</span> en pérdidas latentes realizables
            que podrían compensar ganancias fiscales.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {alerts.map((alert) => (
          <div
            key={alert.ticker}
            className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg text-xs"
          >
            <div className="space-y-0.5">
              <p className="font-semibold text-gray-800">{alert.ticker}</p>
              <p className="text-gray-500">
                Compra: ${alert.purchasePrice.toFixed(2)} · Actual: ${alert.currentPrice.toFixed(2)} · {alert.quantity} acciones
              </p>
            </div>
            <div className="text-right space-y-0.5">
              <p className="font-bold text-red-600">–{fmtMoney(alert.latentLoss)}</p>
              {alert.alternative && (
                <p className="text-gray-400">
                  Alternativa: <span className="font-medium text-gray-600">{alert.alternative}</span>
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-2">
        Aviso legal: esta información es orientativa. La app no presta asesoramiento fiscal.
        Consulta a un asesor antes de actuar. La normativa varía según el país.
        En España, el art. 33 LIRPF prohíbe recomprar el mismo activo en los 2 meses siguientes.
      </p>
    </div>
  );
}
