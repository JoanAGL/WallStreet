import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getTransactionHistory } from "@/services/transactionService";
import Link from "next/link";
import DeleteTransactionButton from "@/components/dashboard/DeleteTransactionButton";
import AddManualSellForm from "@/components/dashboard/AddManualSellForm";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { entries, totalInvested, totalRevenue, totalProfit, totalProfitPct } =
    await getTransactionHistory(session.user.id);

  const fmtUSD = (n: number) =>
    n.toLocaleString("es-ES", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900">Historial de ventas</h1>
        <Link href="/dashboard" className="text-xs text-gray-500 hover:text-gray-700 hover:underline">
          ← Dashboard
        </Link>
      </div>

      {/* ── Add manual entry form ── */}
      <AddManualSellForm />

      {/* ── Aggregates ── */}
      {entries.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }} className="sm:grid-cols-4">
          <StatCard label="Capital invertido" value={fmtUSD(totalInvested)} />
          <StatCard label="Total recaudado"   value={fmtUSD(totalRevenue)} />
          <StatCard
            label="Profit acumulado"
            value={`${totalProfit >= 0 ? "+" : ""}${fmtUSD(totalProfit)}`}
            fg={totalProfit >= 0 ? "#4ADE80" : "#F87171"}
          />
          <StatCard
            label="ROI global"
            value={`${totalProfitPct >= 0 ? "+" : ""}${totalProfitPct.toFixed(2)}%`}
            fg={totalProfitPct >= 0 ? "#4ADE80" : "#F87171"}
          />
        </div>
      )}

      {/* ── Operations list ── */}
      {entries.length === 0 ? (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, padding: 32, textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "var(--fg-5)" }}>
            Aún no tienes ventas registradas. Registra una venta en el panel de transacciones
            de cada acción, o añade una venta histórica con el botón de arriba.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const isProfit = entry.profitAmount >= 0;
            const deleteUrl = entry.source === "manual"
              ? `/api/portfolio/history/manual/${entry.id}`
              : `/api/portfolio/transactions/${entry.id}`;
            const confirmMessage = entry.source === "manual"
              ? "¿Eliminar esta venta histórica?"
              : "¿Eliminar esta transacción? Los cálculos WAC se recalcularán automáticamente.";

            return (
              <div
                key={entry.id}
                style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}
              >
                {/* Header row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--fg-1)" }}>{entry.ticker}</span>
                    <span style={{
                      fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 9999,
                      background: isProfit ? "rgba(16,163,74,.15)"  : "rgba(239,68,68,.15)",
                      border:     isProfit ? "1px solid rgba(16,163,74,.4)" : "1px solid rgba(239,68,68,.4)",
                      color:      isProfit ? "#4ADE80" : "#F87171",
                    }}>
                      {isProfit ? "+" : ""}{entry.profitPercentage.toFixed(2)}%
                    </span>
                    {entry.source === "manual" && (
                      <span style={{ fontSize: 10, fontWeight: 500, color: "var(--fg-5)", background: "var(--card-inner)", border: "1px solid var(--card-border)", borderRadius: 9999, padding: "1px 8px" }}>
                        manual
                      </span>
                    )}
                    {entry.notes && (
                      <span style={{ fontSize: 12, color: "var(--fg-5)", fontStyle: "italic", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={entry.notes}>
                        {entry.notes}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: "var(--fg-5)" }}>
                      {new Date(entry.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                    <DeleteTransactionButton
                      deleteUrl={deleteUrl}
                      confirmMessage={confirmMessage}
                    />
                  </div>
                </div>

                {/* Metrics grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }} className="sm:grid-cols-4">
                  <MetricCell label="Acciones"           value={entry.shares % 1 === 0 ? String(entry.shares) : entry.shares.toFixed(4)} />
                  <MetricCell label="Precio medio compra" value={fmtUSD(entry.avgCostAtSale)} />
                  <MetricCell label="Precio venta"        value={fmtUSD(entry.sellPrice)} />
                  <MetricCell
                    label="Profit"
                    value={`${isProfit ? "+" : ""}${fmtUSD(entry.profitAmount)}`}
                    fg={isProfit ? "#4ADE80" : "#F87171"}
                  />
                </div>

                {/* Secondary row */}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--fg-5)", borderTop: "1px solid var(--card-border-inner)", paddingTop: 8 }}>
                  <span>Invertido: <span style={{ color: "var(--fg-3)", fontWeight: 500 }}>{fmtUSD(entry.investedAmount)}</span></span>
                  <span>Recaudado: <span style={{ color: "var(--fg-3)", fontWeight: 500 }}>{fmtUSD(entry.revenueAmount)}</span></span>
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
function StatCard({ label, value, fg = "var(--fg-1)" }: { label: string; value: string; fg?: string }) {
  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, padding: 12, textAlign: "center" }}>
      <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--fg-5)" }}>{label}</p>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: fg }}>{value}</p>
    </div>
  );
}

function MetricCell({ label, value, fg = "var(--fg-2)" }: { label: string; value: string; fg?: string }) {
  return (
    <div style={{ background: "var(--card-inner)", border: "1px solid var(--card-border-inner)", borderRadius: 8, padding: 8 }}>
      <p style={{ margin: "0 0 2px", fontSize: 11, color: "var(--fg-5)" }}>{label}</p>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: fg }}>{value}</p>
    </div>
  );
}
