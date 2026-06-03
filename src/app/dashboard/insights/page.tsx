import { getServerSession }    from "next-auth";
import { redirect }            from "next/navigation";
import { authOptions }         from "@/lib/auth";
import { getDecisionAnalysis } from "@/services/decisionAnalysisService";
import type { DecisionAnalysis, DecisionEntry } from "@/services/decisionAnalysisService";
import Link from "next/link";

export const dynamic     = "force-dynamic";
export const maxDuration = 30;

export default async function InsightsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  let analysis: DecisionAnalysis | null = null;
  let loadError = "";
  try {
    analysis = await getDecisionAnalysis(session.user.id);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Error al cargar insights.";
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px", display: "flex", flexDirection: "column", gap: 20 }}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--fg-1)" }}>
            Análisis de Decisiones
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--fg-4)" }}>
            Motor de psicología financiera &mdash; sesgos cognitivos e insights de inversión
          </p>
        </div>
        <Link href="/dashboard" style={{ fontSize: 12, color: "var(--link)", textDecoration: "none" }}>
          &larr; Dashboard
        </Link>
      </div>

      {loadError && <Callout color="neg" text={loadError} />}

      {analysis && analysis.totalClosedTrades === 0 && (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, padding: 32, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 14, color: "var(--fg-5)" }}>
            Aún no hay operaciones cerradas. Importa tu historial de DEGIRO o registra ventas para ver los insights.
          </p>
          <Link href="/dashboard/import" style={{ display: "inline-block", marginTop: 14, fontSize: 13, color: "var(--link)", textDecoration: "none" }}>
            Importar desde DEGIRO &rarr;
          </Link>
        </div>
      )}

      {analysis && analysis.totalClosedTrades > 0 && (
        <>
          {/* KPI row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
            <KpiCard label="Operaciones cerradas" value={String(analysis.totalClosedTrades)} />
            <KpiCard
              label="P&L realizado total"
              value={`${analysis.totalRealizedProfit >= 0 ? "+" : ""}${fmtUSD(analysis.totalRealizedProfit)}`}
              fg={analysis.totalRealizedProfit >= 0 ? "#4ADE80" : "#F87171"}
            />
            <KpiCard
              label="Profit Factor"
              value={analysis.profitFactor != null ? analysis.profitFactor.toFixed(2) : "&#8734;"}
              fg={analysis.profitFactor == null ? "#4ADE80" : analysis.profitFactor >= 2 ? "#4ADE80" : analysis.profitFactor >= 1 ? "#FCD34D" : "#F87171"}
              hint={analysis.profitFactor == null ? "Sin pérdidas" : analysis.profitFactor >= 2 ? "Excelente" : analysis.profitFactor >= 1 ? "Positivo" : "Pérdidas superiores a ganancias"}
            />
            <KpiCard
              label="Alpha vs S&P 500"
              value={`${analysis.sp500.alphaPct >= 0 ? "+" : ""}${analysis.sp500.alphaPct.toFixed(2)}%`}
              fg={analysis.sp500.beatingMarket ? "#4ADE80" : "#F87171"}
              hint={analysis.sp500.beatingMarket ? "Batiendo al mercado" : "Por debajo del índice"}
            />
          </div>

          {/* S&P 500 benchmark */}
          <Section title="Benchmark S&P 500" icon="&#128202;">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <MetricCell label="Tu cartera (realizado)" value={`${analysis.sp500.portfolioReturnPct >= 0 ? "+" : ""}${analysis.sp500.portfolioReturnPct.toFixed(2)}%`} fg={analysis.sp500.portfolioReturnPct >= 0 ? "#4ADE80" : "#F87171"} />
              <MetricCell label="S&P 500 simulado (SPY)" value={`${analysis.sp500.spyReturnPct >= 0 ? "+" : ""}${analysis.sp500.spyReturnPct.toFixed(2)}%`} fg="#93C5FD" />
              <MetricCell label="Capital analizado" value={fmtUSD(analysis.sp500.totalInvested)} />
              <MetricCell
                label="P&L cartera vs SPY"
                value={fmtUSD(analysis.sp500.portfolioRealizedGain - analysis.sp500.spySimulatedGain)}
                fg={analysis.sp500.portfolioRealizedGain >= analysis.sp500.spySimulatedGain ? "#4ADE80" : "#F87171"}
              />
            </div>
            <Callout
              color={analysis.sp500.beatingMarket ? "pos" : "neg"}
              text={analysis.sp500.beatingMarket
                ? `Tu stock-picking supera al S&P 500 en ${analysis.sp500.alphaPct.toFixed(2)} puntos porcentuales.`
                : `El ETF SPY habría rendido ${Math.abs(analysis.sp500.alphaPct).toFixed(2)}pp más que tu stock-picking en el mismo período con el mismo capital.`}
            />
          </Section>

          {/* Disposition Effect */}
          <Section
            title="Efecto Disposición"
            icon={analysis.disposition.biasDetected ? "&#9888;&#65039;" : "&#10003;"}
            highlight={analysis.disposition.biasDetected ? "neg" : "pos"}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <MetricCell label="Días medios en ganadoras" value={`${analysis.disposition.avgDaysWinners}d`} fg="#4ADE80" />
              <MetricCell label="Días medios en perdedoras" value={`${analysis.disposition.avgDaysLosers}d`} fg={analysis.disposition.biasDetected ? "#F87171" : "var(--fg-2)"} />
            </div>
            <Callout color={analysis.disposition.biasDetected ? "neg" : "pos"} text={analysis.disposition.insight} />
          </Section>

          {/* Premature Sales */}
          {analysis.prematureSales.length > 0 && (
            <Section title="Ventas Prematuras" icon="&#128200;" highlight="warn">
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--fg-4)" }}>
                Posiciones vendidas cuyo precio actual supera en más del 10% tu precio de venta:
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {analysis.prematureSales.map((ps) => (
                  <div key={ps.ticker} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--card-inner)", border: "1px solid var(--card-border-inner)", borderRadius: 10, padding: "10px 14px" }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--fg-1)" }}>{ps.ticker}</span>
                      <span style={{ fontSize: 12, color: "var(--fg-5)", marginLeft: 8 }}>
                        Vendiste a {fmtUSD(ps.sellPrice)} &middot; Ahora {fmtUSD(ps.currentPrice)}
                      </span>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#F87171" }}>-{fmtUSD(ps.missedProfit)}</div>
                      <div style={{ fontSize: 11, color: "var(--fg-5)" }}>+{ps.missedProfitPct.toFixed(1)}% no capturado</div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Best & Worst */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {analysis.topDecisions.length > 0 && (
              <Section title="Mejores decisiones" icon="&#127942;">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {analysis.topDecisions.map((d, i) => <DecisionCard key={i} entry={d} rank={i + 1} />)}
                </div>
              </Section>
            )}
            {analysis.worstMistakes.length > 0 && (
              <Section title="Mayores errores" icon="&#10060;">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {analysis.worstMistakes.map((d, i) => <DecisionCard key={i} entry={d} rank={i + 1} />)}
                </div>
              </Section>
            )}
          </div>
        </>
      )}

      <div style={{ textAlign: "center", paddingTop: 8 }}>
        <Link href="/dashboard/import" style={{ fontSize: 13, color: "var(--fg-4)", textDecoration: "none", borderBottom: "1px dashed var(--card-border)", paddingBottom: 1 }}>
          Importar más transacciones desde DEGIRO
        </Link>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUSD(n: number) {
  return Math.abs(n).toLocaleString("es-ES", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function KpiCard({ label, value, fg = "var(--fg-1)", hint }: { label: string; value: string; fg?: string; hint?: string }) {
  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, padding: "12px 14px" }}>
      <p style={{ margin: "0 0 2px", fontSize: 11, color: "var(--fg-5)", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</p>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: fg }} dangerouslySetInnerHTML={{ __html: value }} />
      {hint && <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--fg-5)" }}>{hint}</p>}
    </div>
  );
}

function MetricCell({ label, value, fg = "var(--fg-2)" }: { label: string; value: string; fg?: string }) {
  return (
    <div style={{ background: "var(--card-inner)", border: "1px solid var(--card-border-inner)", borderRadius: 8, padding: "9px 12px" }}>
      <p style={{ margin: "0 0 2px", fontSize: 11, color: "var(--fg-5)" }}>{label}</p>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: fg }}>{value}</p>
    </div>
  );
}

function Section({ title, icon, children, highlight }: {
  title: string; icon: string; children: React.ReactNode; highlight?: "pos" | "neg" | "warn";
}) {
  const border = highlight === "pos" ? "rgba(16,163,74,.35)" : highlight === "neg" ? "rgba(239,68,68,.35)" : highlight === "warn" ? "rgba(245,158,11,.3)" : "var(--card-border)";
  return (
    <div style={{ background: "var(--card-bg)", border: `1px solid ${border}`, borderRadius: 12, padding: 16 }}>
      <p style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "var(--fg-2)", display: "flex", alignItems: "center", gap: 6 }}>
        <span dangerouslySetInnerHTML={{ __html: icon }} /> {title}
      </p>
      {children}
    </div>
  );
}

function Callout({ color, text }: { color: "pos" | "neg" | "warn" | "info"; text: string }) {
  const s = { pos: { bg: "rgba(16,163,74,.1)", bd: "rgba(16,163,74,.35)", fg: "#4ADE80" }, neg: { bg: "rgba(239,68,68,.1)", bd: "rgba(239,68,68,.35)", fg: "#F87171" }, warn: { bg: "rgba(245,158,11,.1)", bd: "rgba(245,158,11,.3)", fg: "#FCD34D" }, info: { bg: "rgba(37,99,235,.12)", bd: "rgba(37,99,235,.35)", fg: "#93C5FD" } }[color];
  return <div style={{ background: s.bg, border: `1px solid ${s.bd}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: s.fg, lineHeight: 1.5 }}>{text}</div>;
}

function DecisionCard({ entry, rank }: { entry: DecisionEntry; rank: number }) {
  const isPos = entry.profitAmt >= 0;
  return (
    <div style={{ background: "var(--card-inner)", border: "1px solid var(--card-border-inner)", borderRadius: 8, padding: "9px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: "var(--fg-5)", minWidth: 16 }}>#{rank}</span>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--fg-1)" }}>{entry.ticker}</p>
          <p style={{ margin: 0, fontSize: 11, color: "var(--fg-5)" }}>{entry.holdingDays}d &middot; {entry.date}</p>
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: isPos ? "#4ADE80" : "#F87171" }}>{isPos ? "+" : ""}{fmtUSD(entry.profitAmt)}</p>
        <p style={{ margin: 0, fontSize: 11, color: isPos ? "#4ADE80" : "#F87171" }}>{isPos ? "+" : ""}{entry.profitPct.toFixed(2)}%</p>
      </div>
    </div>
  );
}
