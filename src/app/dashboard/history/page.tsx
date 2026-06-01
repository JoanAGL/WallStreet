import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getTransactionHistory } from "@/services/transactionService";
import Link from "next/link";
import DeleteTransactionButton from "@/components/dashboard/DeleteTransactionButton";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { entries, totalInvested, totalRevenue, totalProfit, totalProfitPct } =
    await getTransactionHistory(session.user.id);

  const fmtUSD = (n: number) =>
    n.toLocaleString("es-ES", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
  const profitColor = (n: number) => (n >= 0 ? "text-green-600" : "text-red-600");

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

      {/* ── Header with back nav ── */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900">Historial de ventas</h1>
        <Link
          href="/dashboard"
          className="text-xs text-slate-500 hover:text-slate-700 hover:underline"
        >
          ← Dashboard
        </Link>
      </div>

      {/* ── Aggregates ── */}
      {entries.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Capital invertido"  value={fmtUSD(totalInvested)} />
          <StatCard label="Total recaudado"    value={fmtUSD(totalRevenue)} />
          <StatCard
            label="Profit acumulado"
            value={`${totalProfit >= 0 ? "+" : ""}${fmtUSD(totalProfit)}`}
            valueClass={profitColor(totalProfit)}
          />
          <StatCard
            label="ROI global"
            value={`${totalProfitPct >= 0 ? "+" : ""}${totalProfitPct.toFixed(2)}%`}
            valueClass={profitColor(totalProfitPct)}
          />
        </div>
      )}

      {/* ── Operations list ── */}
      {entries.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-sm text-slate-500">
            Aún no tienes ventas registradas. Cuando registres una transacción de tipo SELL, aparecerá aquí.
          </p>
          <Link href="/dashboard" className="mt-3 inline-block text-xs text-blue-500 hover:underline">
            ← Volver al dashboard
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const isProfit = entry.profitAmount >= 0;
            return (
              <div
                key={entry.id}
                className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3"
              >
                {/* Header row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900">{entry.ticker}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      isProfit ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {isProfit ? "+" : ""}{entry.profitPercentage.toFixed(2)}%
                    </span>
                    {entry.notes && (
                      <span className="text-xs text-slate-400 italic truncate max-w-[120px]" title={entry.notes}>
                        {entry.notes}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">
                      {new Date(entry.date).toLocaleDateString("es-ES", {
                        day: "2-digit", month: "short", year: "numeric",
                      })}
                    </span>
                    <DeleteTransactionButton transactionId={entry.id} />
                  </div>
                </div>

                {/* Metrics grid */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
                  <MetricCell
                    label="Acciones"
                    value={entry.shares % 1 === 0 ? String(entry.shares) : entry.shares.toFixed(4)}
                  />
                  <MetricCell label="Precio medio compra" value={fmtUSD(entry.avgCostAtSale)} />
                  <MetricCell label="Precio venta"        value={fmtUSD(entry.sellPrice)} />
                  <MetricCell
                    label="Profit"
                    value={`${isProfit ? "+" : ""}${fmtUSD(entry.profitAmount)}`}
                    valueClass={profitColor(entry.profitAmount)}
                  />
                </div>

                {/* Secondary row */}
                <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-100 pt-2">
                  <span>Invertido: <span className="text-slate-600 font-medium">{fmtUSD(entry.investedAmount)}</span></span>
                  <span>Recaudado: <span className="text-slate-600 font-medium">{fmtUSD(entry.revenueAmount)}</span></span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Layout helpers ────────────────────────────────────────────────────────────
function StatCard({ label, value, valueClass = "text-gray-900" }: {
  label:       string;
  value:       string;
  valueClass?: string;
}) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
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
    <div className="bg-white rounded-lg p-2 border border-slate-100">
      <p className="text-slate-500 mb-0.5">{label}</p>
      <p className={`font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}
