import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getPortfolioMetrics } from "@/services/transactionService";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Build currentPrices map from latest StockAnalysis per stock.
  // Always in USD (priceUSD for European stocks); a price of 0 means the
  // market data is degraded — treat it as "no price" so the position shows
  // as sin precio instead of a fake −100% unrealized loss.
  const analyses = await prisma.stockAnalysis.findMany({
    where:   { stock: { userId: session.user.id } },
    select:  { stockId: true, price: true, priceUSD: true },
  });
  const currentPrices: Record<string, number> = {};
  for (const a of analyses) {
    const usd = a.priceUSD ?? a.price;
    if (usd > 0) currentPrices[a.stockId] = usd;
  }

  const summary = await getPortfolioMetrics(session.user.id, currentPrices);

  const fmtUSD = (n: number) =>
    n.toLocaleString("es-ES", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
  const fmtPct = (n: number, sign = true) =>
    `${sign && n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
  const pnlCls = (n: number | null) =>
    n == null ? "text-gray-500" : n >= 0 ? "text-green-600 font-bold" : "text-red-600 font-bold";

  const hasPositions = summary.positions.length > 0;
  const unpriced = summary.positions.filter(
    (p) => p.openShares > 0 && p.currentValue == null
  );
  const totalDividends = summary.positions.reduce((s, p) => s + p.totalDividends, 0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900">Rendimiento de cartera</h1>
        <Link href="/dashboard" className="text-xs text-blue-500 hover:underline">← Dashboard</Link>
      </div>

      {!hasPositions ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-10 text-center">
          <p className="text-sm text-gray-500">
            Aún no has registrado transacciones. Usa el panel «Transacciones» en cada acción del dashboard.
          </p>
        </div>
      ) : (
        <>
          {/* ── Portfolio totals ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatCard label="Valor actual"    value={fmtUSD(summary.totalCurrentValue)} />
            <StatCard label="Coste base"      value={fmtUSD(summary.totalCostBasis)} />
            <StatCard
              label="PnL no realizado"
              value={summary.totalUnrealizedPnL != null ? fmtUSD(summary.totalUnrealizedPnL) : "—"}
              sub={summary.totalUnrealizedPnLPct != null ? fmtPct(summary.totalUnrealizedPnLPct) : undefined}
              valueClass={pnlCls(summary.totalUnrealizedPnL)}
            />
            <StatCard
              label="PnL realizado"
              value={fmtUSD(summary.totalRealizedPnL)}
              valueClass={pnlCls(summary.totalRealizedPnL)}
            />
            <StatCard
              label="PnL total"
              value={fmtUSD((summary.totalUnrealizedPnL ?? 0) + summary.totalRealizedPnL)}
              valueClass={pnlCls((summary.totalUnrealizedPnL ?? 0) + summary.totalRealizedPnL)}
            />
            {totalDividends > 0 && (
              <StatCard
                label="Dividendos netos"
                value={fmtUSD(totalDividends)}
                valueClass="text-green-600 font-bold"
              />
            )}
          </div>

          {unpriced.length > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚠ Sin precio de mercado — excluidas del valor actual y del PnL no realizado:{" "}
              {unpriced.map((p) => p.ticker).join(", ")}. Pulsa «Actualizar datos» en el dashboard.
            </p>
          )}

          {/* ── Per-position cards ── */}
          <div className="space-y-4">
            {summary.positions
              .sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0))
              .map((pos) => (
                <div key={pos.stockId} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">

                  {/* Position header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-bold text-gray-900">{pos.ticker}</span>
                      {pos.portfolioWeightPct != null && (
                        <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
                          {pos.portfolioWeightPct.toFixed(1)}% cartera
                        </span>
                      )}
                      {pos.openShares > 0 && (
                        <span className="text-xs text-gray-500">{pos.openShares} {pos.openShares === 1 ? "acción" : "acciones"}</span>
                      )}
                    </div>
                    {pos.currentValue != null && (
                      <span className="text-sm font-bold text-gray-800">{fmtUSD(pos.currentValue)}</span>
                    )}
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
                    <Cell label="Precio medio compra"
                      value={pos.avgBuyPrice != null ? fmtUSD(pos.avgBuyPrice) : "—"} />
                    <Cell label="Precio equilibrio"
                      value={pos.breakEvenPrice != null ? fmtUSD(pos.breakEvenPrice) : "—"} />
                    <Cell label="Coste base"       value={fmtUSD(pos.openCostBasis)} />
                    <Cell
                      label="PnL no realizado"
                      value={pos.unrealizedPnL != null ? fmtUSD(pos.unrealizedPnL) : "—"}
                      sub={pos.unrealizedPnLPct != null ? fmtPct(pos.unrealizedPnLPct) : undefined}
                      valueClass={pnlCls(pos.unrealizedPnL)}
                    />
                    <Cell
                      label="PnL realizado"
                      value={fmtUSD(pos.realizedPnL)}
                      sub={pos.realizedPnLPct != null ? fmtPct(pos.realizedPnLPct) : undefined}
                      valueClass={pnlCls(pos.realizedPnL)}
                    />
                    <Cell label="Días en cartera"
                      value={pos.daysHeld != null ? `${pos.daysHeld} días` : "—"} />
                    <Cell
                      label="CAGR anualizado"
                      value={pos.annualizedReturn != null ? fmtPct(pos.annualizedReturn) : "—"}
                      valueClass={pnlCls(pos.annualizedReturn)}
                    />
                    {pos.avgSellPrice != null && (
                      <Cell label="Precio medio venta" value={fmtUSD(pos.avgSellPrice)} />
                    )}
                    {pos.totalDividends > 0 && (
                      <Cell label="Dividendos netos" value={fmtUSD(pos.totalDividends)}
                        valueClass="text-green-600 font-bold" />
                    )}
                    {pos.totalFees > 0 && (
                      <Cell label="Comisiones" value={fmtUSD(pos.totalFees)} />
                    )}
                  </div>

                  {/* Transaction list */}
                  {pos.transactions.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-500 hover:text-gray-700 select-none">
                        {pos.transactions.length} {pos.transactions.length === 1 ? "transacción" : "transacciones"}
                      </summary>
                      <div className="mt-2 space-y-1.5">
                        {[...pos.transactions]
                          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                          .map((tx) => {
                            const isBuy   = tx.type === "BUY";
                            const isSplit = tx.type === "SPLIT";
                            const isDiv   = tx.type === "DIVIDEND";
                            const dateStr = tx.date
                              ? new Date(tx.date).toLocaleDateString("es-ES")
                              : new Date(tx.createdAt).toLocaleDateString("es-ES");
                            return (
                              <div key={tx.id}
                                className="flex items-center gap-3 rounded-lg bg-gray-50 border border-gray-100 px-3 py-1.5">
                                <span className={`font-bold w-10 ${isSplit ? "text-blue-600" : isDiv ? "text-amber-600" : isBuy ? "text-green-600" : "text-red-600"}`}>
                                  {isDiv ? "DIV" : tx.type}
                                </span>
                                <span className="text-gray-700 flex-1">
                                  {isSplit
                                    ? `Split ×${tx.shares}`
                                    : isDiv
                                    ? `Dividendo: ${fmtUSD(tx.shares * tx.price - (tx.fee ?? 0))} neto`
                                    : <>{tx.shares} acc. × {fmtUSD(tx.price)} = {fmtUSD(tx.shares * tx.price)}{tx.fee ? ` − ${fmtUSD(tx.fee)} com.` : ""}</>}
                                </span>
                                <span className="text-gray-400">{dateStr}</span>
                                {tx.notes && (
                                  <span className="text-gray-400 italic truncate max-w-[120px]"
                                    title={tx.notes}>{tx.notes}</span>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </details>
                  )}
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Layout helpers ────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, valueClass = "text-gray-900" }: {
  label: string; value: string; sub?: string; valueClass?: string;
}) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-sm ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function Cell({ label, value, sub, valueClass = "text-gray-800" }: {
  label: string; value: string; sub?: string; valueClass?: string;
}) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-lg p-2">
      <p className="text-gray-400 mb-0.5">{label}</p>
      <p className={valueClass}>{value}</p>
      {sub && <p className="text-gray-400">{sub}</p>}
    </div>
  );
}
