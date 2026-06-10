import type { SellHistoryEntry } from "@/services/transactionService";
import { detectHarvestOpportunities } from "@/lib/portfolioMath";

export interface HarvestCandidate {
  ticker:        string;
  purchasePrice: number | null;   // WAC de transacciones, o purchasePrice del Stock
  currentPrice:  number;
  quantity:      number | null;
}

interface Props {
  candidates:     HarvestCandidate[];
  realizedLosses: SellHistoryEntry[];   // losses confirmed this fiscal year (profitAmount < 0)
}

function fmtMoney(n: number): string {
  return Math.abs(n).toLocaleString("es-ES", {
    style: "currency", currency: "USD", minimumFractionDigits: 2,
  });
}

export default function TaxHarvestingPanel({ candidates, realizedLosses }: Props) {
  const currentYear = new Date().getFullYear();

  const alerts = detectHarvestOpportunities(candidates);

  if (alerts.length === 0 && realizedLosses.length === 0) return null;

  const totalLatentLoss   = alerts.reduce((s, a) => s + a.latentLoss, 0);
  const totalRealizedLoss = realizedLosses.reduce((s, e) => s + e.profitAmount, 0);
  const totalCombined     = totalRealizedLoss + totalLatentLoss;

  return (
    <div style={{
      background: "var(--card-bg)", border: "1px solid rgba(245,158,11,.4)",
      borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 14,
    }}>
      {/* Header */}
      <div>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#FCD34D", textTransform: "uppercase", letterSpacing: ".05em" }}>
          &#9888; Tax Harvesting
        </p>
        <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--fg-4)" }}>
          Oportunidades de compensación fiscal para el año {currentYear}
        </p>
      </div>

      {/* ── Section 1: Realized losses (confirmed) ─────────────────────────── */}
      {realizedLosses.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#4ADE80", textTransform: "uppercase", letterSpacing: ".05em" }}>
            &#10003; Pérdidas confirmadas {currentYear}
          </p>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--fg-5)" }}>
            Ya realizadas — deducibles sin necesidad de vender nada más
          </p>

          {realizedLosses.map((loss) => (
            <div key={loss.id} style={{
              display: "flex", flexWrap: "wrap", alignItems: "center",
              justifyContent: "space-between", gap: 8,
              padding: "8px 12px",
              background: "rgba(16,163,74,.06)", border: "1px solid rgba(16,163,74,.2)",
              borderRadius: 8,
            }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--fg-1)" }}>
                  {loss.ticker}
                </span>
                <span style={{ fontSize: 11, color: "var(--fg-5)", marginLeft: 8 }}>
                  Vendido {new Date(loss.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                  {" "}· {loss.shares} acc. a ${loss.sellPrice.toFixed(2)}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span style={{ fontWeight: 700, color: "#F87171", fontSize: 13 }}>
                  &ndash;{fmtMoney(loss.profitAmount)}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 9999,
                  background: "rgba(16,163,74,.15)", border: "1px solid rgba(16,163,74,.35)",
                  color: "#4ADE80",
                }}>
                  Confirmada
                </span>
              </div>
            </div>
          ))}

          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--fg-4)", fontWeight: 600 }}>
            Total confirmado:{" "}
            <span style={{ color: "#F87171" }}>&ndash;{fmtMoney(totalRealizedLoss)}</span>
            {" "}&#8212; compensan ganancias sin acción adicional
          </p>
        </div>
      )}

      {/* Divider between sections */}
      {realizedLosses.length > 0 && alerts.length > 0 && (
        <hr style={{ border: 0, borderTop: "1px solid var(--card-border-inner)", margin: 0 }} />
      )}

      {/* ── Section 2: Latent losses (open positions) ──────────────────────── */}
      {alerts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#FCD34D", textTransform: "uppercase", letterSpacing: ".05em" }}>
            &#8987; Pérdidas latentes realizables
          </p>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--fg-5)" }}>
            Posiciones abiertas con pérdida &gt; $100 — vendibles para materializar la pérdida fiscal
          </p>

          {alerts.map((alert) => (
            <div key={alert.ticker} style={{
              display: "flex", flexWrap: "wrap", alignItems: "center",
              justifyContent: "space-between", gap: 8,
              padding: "8px 12px",
              background: "rgba(245,158,11,.07)", border: "1px solid rgba(245,158,11,.25)",
              borderRadius: 8,
            }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--fg-1)" }}>
                  {alert.ticker}
                </span>
                <span style={{ fontSize: 11, color: "var(--fg-5)", marginLeft: 8 }}>
                  Compra: ${alert.purchasePrice.toFixed(2)} · Actual: ${alert.currentPrice.toFixed(2)} · {alert.quantity} acc.
                </span>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p style={{ margin: 0, fontWeight: 700, color: "#F87171", fontSize: 13 }}>
                  &ndash;{fmtMoney(alert.latentLoss)}
                </p>
                {alert.alternative && (
                  <p style={{ margin: 0, fontSize: 11, color: "var(--fg-5)" }}>
                    Alternativa: <span style={{ fontWeight: 500, color: "var(--fg-4)" }}>{alert.alternative}</span>
                  </p>
                )}
              </div>
            </div>
          ))}

          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--fg-4)", fontWeight: 600 }}>
            Total latente:{" "}
            <span style={{ color: "#F87171" }}>&ndash;{fmtMoney(totalLatentLoss)}</span>
          </p>
        </div>
      )}

      {/* ── Combined total ─────────────────────────────────────────────────── */}
      {realizedLosses.length > 0 && alerts.length > 0 && (
        <div style={{
          padding: "10px 12px",
          background: "rgba(37,99,235,.08)", border: "1px solid rgba(37,99,235,.25)",
          borderRadius: 8, fontSize: 12, color: "#93C5FD",
        }}>
          &#128161; Potencial total de compensación fiscal:{" "}
          <strong style={{ color: "#F87171" }}>&ndash;{fmtMoney(Math.abs(totalCombined))}</strong>
          {" "}({fmtMoney(Math.abs(totalRealizedLoss))} confirmadas + {fmtMoney(Math.abs(totalLatentLoss))} latentes)
        </div>
      )}

      {/* Legal notice */}
      <p style={{
        margin: 0, fontSize: 11, color: "var(--fg-5)", fontStyle: "italic",
        borderTop: "1px solid var(--card-border-inner)", paddingTop: 8,
      }}>
        Aviso legal: información orientativa para el año fiscal {currentYear}. No constituye asesoramiento fiscal.
        En España, el art. 33 LIRPF prohíbe recomprar el mismo activo en los 2 meses siguientes a la venta con pérdida.
        Consulta a un asesor antes de actuar.
      </p>
    </div>
  );
}
