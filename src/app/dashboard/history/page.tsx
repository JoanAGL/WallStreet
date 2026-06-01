import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getClosedPerformance } from "@/services/portfolioService";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { operations, totalInvested, totalRevenue, totalProfitAmount, totalProfitPct } =
    await getClosedPerformance(session.user.id);

  const fmtUSD = (n: number) =>
    n.toLocaleString("es-ES", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
  const profitColor = (n: number) => (n >= 0 ? "text-green-600" : "text-red-600");

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Historial de operaciones cerradas</h1>

      {/* ── Aggregates ── */}
      {operations.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Capital invertido"     value={fmtUSD(totalInvested)}                         />
          <StatCard label="Total recaudado"        value={fmtUSD(totalRevenue)}                          />
          <StatCard
            label="Profit acumulado"
            value={`${totalProfitAmount >= 0 ? "+" : ""}${fmtUSD(totalProfitAmount)}`}
            valueClass={profitColor(totalProfitAmount)}
          />
          <StatCard
            label="ROI global"
            value={`${totalProfitPct >= 0 ? "+" : ""}${totalProfitPct.toFixed(2)}%`}
            valueClass={profitColor(totalProfitPct)}
          />
        </div>
      )}

      {/* ── Operations list ── */}
      {operations.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center">
          <p className="text-sm text-gray-500">
            Aún no tienes operaciones cerradas. Cuando vendas una posición, aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {operations.map((op) => {
            const isProfit = op.profitAmount >= 0;
            return (
              <div
                key={op.id}
                className="bg-white border border-gray-200 rounded-xl p-4 space-y-3"
              >
                {/* Header row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900">{op.ticker}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isProfit ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {isProfit ? "+" : ""}{op.profitPercentage.toFixed(2)}%
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(op.closedAt).toLocaleDateString("es-ES", {
                      day: "2-digit", month: "short", year: "numeric",
                    })}
                  </span>
                </div>

                {/* Metrics grid */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
                  <MetricCell label="Acciones"     value={op.shares % 1 === 0 ? String(op.shares) : op.shares.toFixed(4)} />
                  <MetricCell label="Precio compra" value={fmtUSD(op.buyPrice)} />
                  <MetricCell label="Precio venta"  value={fmtUSD(op.sellPrice)} />
                  <MetricCell
                    label="Profit"
                    value={`${isProfit ? "+" : ""}${fmtUSD(op.profitAmount)}`}
                    valueClass={profitColor(op.profitAmount)}
                  />
                </div>

                {/* Secondary row */}
                <div className="flex items-center justify-between text-xs text-gray-400 border-t border-gray-100 pt-2">
                  <span>Invertido: <span className="text-gray-600 font-medium">{fmtUSD(op.investedAmount)}</span></span>
                  <span>Recaudado: <span className="text-gray-600 font-medium">{fmtUSD(op.revenueAmount)}</span></span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, valueClass = "text-gray-900" }: {
  label:       string;
  value:       string;
  valueClass?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-sm font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

function MetricCell({ label, value, valueClass = "text-gray-800" }: {
  label:       string;
  value:       string;
  valueClass?: string;
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
      <p className="text-gray-500 mb-0.5">{label}</p>
      <p className={`font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}
