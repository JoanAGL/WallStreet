import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { findStockByTickerAndUser } from "@/repositories/stockRepository";
import { getStockHistory } from "@/repositories/analysisHistoryRepository";
import { HORIZON_LABELS } from "@/types/models";
import type { InvestmentHorizon } from "@/types/models";
import PriceChart from "@/components/dashboard/PriceChart";

export const dynamic = "force-dynamic";

const SCENARIO_COLORS: Record<string, string> = {
  Positivo: "text-green-700 bg-green-50 border-green-200",
  Neutral:  "text-yellow-700 bg-yellow-50 border-yellow-200",
  Negativo: "text-red-700 bg-red-50 border-red-200",
};

interface Props {
  params: { ticker: string };
}

export default async function TickerHistoryPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const ticker = params.ticker.toUpperCase();
  const stock = await findStockByTickerAndUser(ticker, session.user.id);
  if (!stock) notFound();

  const history = await getStockHistory(stock.id, 30);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          ← Dashboard
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">{ticker}</h1>
        <span className="text-sm text-gray-400">Historial de análisis</span>
      </div>

      {history.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-3">📋</p>
          <p className="text-sm">
            Aún no hay historial. Se generará a partir de la próxima actualización.
          </p>
        </div>
      ) : (
        <>
          {/* Price chart — chronological order (oldest → newest) */}
          {history.length >= 2 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Precio — últimas {history.length} sesiones
              </p>
              <PriceChart
                data={[...history].reverse().map((r) => ({
                  date:  new Date(r.snapshotAt).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }),
                  price: r.price,
                }))}
              />
            </div>
          )}

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["Fecha", "Precio", "Cambio", "Escenario", "RSI 14", "Horizonte"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((row, i) => {
                  const isPositive = row.changePercent >= 0;
                  const scenarioClass = SCENARIO_COLORS[row.scenarioLabel] ?? SCENARIO_COLORS["Neutral"];
                  const horizonLabel = HORIZON_LABELS[row.horizonUsed as InvestmentHorizon] ?? row.horizonUsed;
                  const isLatest = i === 0;

                  return (
                    <tr key={row.id} className={isLatest ? "bg-blue-50/40" : "hover:bg-gray-50"}>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {new Date(row.snapshotAt).toLocaleString("es-ES", {
                          day: "2-digit", month: "2-digit", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                        {isLatest && (
                          <span className="ml-2 text-xs text-blue-600 font-medium">último</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        ${row.price.toFixed(2)}
                      </td>
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
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {horizonLabel}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            Mostrando los últimos {history.length} registros · máximo 30
          </div>
        </div>
        </>
      )}
    </div>
  );
}
