import type { StockWithAnalysis, InvestmentHorizon, PriceRsiDivergence } from "@/types/models";
import { HORIZON_LABELS } from "@/types/models";
import type { HorizonAnalysis, AllHorizonsAIAnalysis } from "@/services/aiAnalysisService";
import { calculateRiskLevel } from "@/lib/riskCalculator";
import RiskBadge from "@/components/ui/RiskBadge";
import RemoveStockButton from "./RemoveStockButton";
import HorizonSelector from "./HorizonSelector";
import StockUpdateMenu from "./StockUpdateMenu";
import TransactionPanel from "./TransactionPanel";
import Link from "next/link";

interface Props {
  stock: StockWithAnalysis;
}

const SCENARIO_BANNER: Record<string, { bg: string; bd: string; fg: string }> = {
  Positivo: { bg: "rgba(16,163,74,.12)",  bd: "rgba(16,163,74,.35)",  fg: "#86EFAC" },
  Neutral:  { bg: "rgba(245,158,11,.10)", bd: "rgba(245,158,11,.30)", fg: "#FCD34D" },
  Negativo: { bg: "rgba(239,68,68,.10)",  bd: "rgba(239,68,68,.35)",  fg: "#FCA5A5" },
};

const ACTION_STYLES: Record<string, { badge: string; bar: string; label: string }> = {
  COMPRA:   { badge: "bg-emerald-500 text-white",  bar: "bg-emerald-500",  label: "COMPRA" },
  VENTA:    { badge: "bg-red-500 text-white",       bar: "bg-red-500",      label: "VENTA" },
  REDUCIR:  { badge: "bg-amber-500 text-white",     bar: "bg-amber-500",    label: "REDUCIR" },
  MANTENER: { badge: "bg-gray-400 text-white",      bar: "bg-gray-400",     label: "MANTENER" },
};

const DIVERGENCE_BADGE: Record<string, { bg: string; bd: string; fg: string }> = {
  REGULAR_BEARISH: { bg: "rgba(239,68,68,.12)",  bd: "rgba(239,68,68,.4)",  fg: "#FCA5A5" },
  HIDDEN_BEARISH:  { bg: "rgba(239,68,68,.12)",  bd: "rgba(239,68,68,.4)",  fg: "#FCA5A5" },
  REGULAR_BULLISH: { bg: "rgba(16,163,74,.12)",  bd: "rgba(16,163,74,.4)",  fg: "#86EFAC" },
  HIDDEN_BULLISH:  { bg: "rgba(16,163,74,.12)",  bd: "rgba(16,163,74,.4)",  fg: "#86EFAC" },
};

function parsePriceRsiDivergence(raw: unknown): PriceRsiDivergence | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.type !== "string" || typeof d.strength !== "string" || typeof d.description !== "string") return null;
  if (d.type === "NONE") return null;
  return d as unknown as PriceRsiDivergence;
}

const AI_UNAVAILABLE_JUSTIFICATION = "El análisis automático no está disponible en este momento.";

function fmt(n: number | null, decimals = 2): string {
  return n !== null ? n.toFixed(decimals) : "—";
}

function fmtPct(n: number | null): string {
  return n !== null ? `${(n * 100).toFixed(1)}%` : "—";
}

type MetricEntry = { label: string; value: string };

function parseAllHorizons(raw: string | null): AllHorizonsAIAnalysis | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as AllHorizonsAIAnalysis; } catch { return null; }
}

function getHorizonAI(all: AllHorizonsAIAnalysis, horizon: InvestmentHorizon): HorizonAnalysis {
  if (horizon === "MEDIUM_TERM") return all.mediumTerm;
  if (horizon === "LONG_TERM")   return all.longTerm;
  return all.shortTerm;
}

function getStoredHorizon(metricsData: string | null): InvestmentHorizon | null {
  if (!metricsData) return null;
  try {
    const m = JSON.parse(metricsData) as Record<string, unknown>;
    if (typeof m._horizon === "string") return m._horizon as InvestmentHorizon;
    if ("trailingPE" in m) return "LONG_TERM";
    if ("revenueGrowthYoY" in m) return "MEDIUM_TERM";
    return "SHORT_TERM";
  } catch { return null; }
}

type MetricsMap = Record<string, number | null>;

function parseMetricsData(raw: string | null): { short: MetricsMap; medium: MetricsMap; long: MetricsMap } {
  const empty = { short: {}, medium: {}, long: {} };
  if (!raw) return empty;
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    // New nested structure
    if (p.short !== undefined || p.medium !== undefined || p.long !== undefined) {
      return {
        short:  (p.short  as MetricsMap) ?? {},
        medium: (p.medium as MetricsMap) ?? {},
        long:   (p.long   as MetricsMap) ?? {},
      };
    }
    // Legacy flat structure — best-effort map
    return { short: p as MetricsMap, medium: p as MetricsMap, long: p as MetricsMap };
  } catch { return empty; }
}

function buildMetricsGrid(horizon: InvestmentHorizon, a: StockWithAnalysis["analysis"]): MetricEntry[] {
  if (!a) return [];
  const { short, medium, long } = parseMetricsData(a.metricsData);

  if (horizon === "SHORT_TERM") {
    return [
      { label: "SMA 20",    value: fmt(a.sma20) },
      { label: "SMA 50",    value: fmt(a.sma50) },
      { label: "RSI 14",    value: fmt(a.rsi14) },
      { label: "ATR 14",    value: fmt(short.atr14 ?? null) },
      { label: "Vol. Rel.", value: short.relVolume != null ? `${fmt(short.relVolume)}x` : "—" },
    ];
  }

  if (horizon === "MEDIUM_TERM") {
    return [
      { label: "Rev. Growth",   value: fmtPct(medium.revenueGrowthYoY ?? null) },
      { label: "EPS Fwd",       value: fmt(medium.forwardEps ?? null) },
      { label: "PEG Ratio",     value: fmt(medium.pegRatio ?? null) },
      { label: "Deuda/Capital", value: fmt(medium.debtToEquity ?? null) },
      { label: "ROE",           value: fmtPct(medium.returnOnEquity ?? null) },
    ];
  }

  return [
    { label: "P/E Trailing", value: fmt(long.trailingPE ?? null) },
    { label: "Div. Yield",   value: fmtPct(long.dividendYield ?? null) },
    { label: "Margen Neto",  value: fmtPct(long.profitMargin ?? null) },
    { label: "FCF Yield",    value: fmtPct(long.freeCashflowYield ?? null) },
    { label: "Beta",         value: fmt(long.beta ?? null) },
  ];
}

export default function StockCard({ stock }: Props) {
  const a = stock.analysis;
  const horizon = stock.investmentHorizon;
  const isPartialAnalysis = a?.scenarioJustification === AI_UNAVAILABLE_JUSTIFICATION;

  // Multi-horizon AI: use allHorizons when available, fall back to individual fields
  const allHorizonsData = parseAllHorizons(a?.allHorizons ?? null);
  const horizonAI = allHorizonsData ? getHorizonAI(allHorizonsData, horizon) : null;

  // Only show stale banner when allHorizons is not available (old records)
  const storedHorizon = getStoredHorizon(a?.metricsData ?? null);
  const isStaleHorizon = !allHorizonsData && !isPartialAnalysis && a !== null
    && storedHorizon !== null && storedHorizon !== horizon;

  // Resolve display values: prefer horizonAI, else fall back to DB fields
  const displayScenarioLabel    = (horizonAI?.scenarioLabel    ?? a?.scenarioLabel    ?? "Neutral") as "Positivo" | "Neutral" | "Negativo";
  const displayScenarioJust     = horizonAI?.scenarioJustification ?? a?.scenarioJustification ?? "";
  const displayAnalysisText     = horizonAI?.analysisText          ?? a?.analysisText          ?? "";
  const displayDivergenceAlert  = horizonAI?.divergenceAlert ?? false;
  const priceRsiDivergence      = parsePriceRsiDivergence(a?.divergenceAlert);
  const displayHorizonMatch     = horizonAI?.horizonMatch          ?? a?.horizonMatch          ?? "";
  const displayKeyMetrics: string[] = horizonAI?.keyMetrics
    ?? (() => { try { return a?.keyMetrics ? JSON.parse(a.keyMetrics) as string[] : []; } catch { return []; } })();

  const displayPortfolioAlert = horizonAI?.portfolioAlert ?? "";
  const prescriptiveAction    = horizonAI?.prescriptiveAction ?? null;
  const actionStyle           = prescriptiveAction
    ? (ACTION_STYLES[prescriptiveAction.action] ?? ACTION_STYLES["MANTENER"])
    : null;

  const riskLevel = a && !isPartialAnalysis
    ? calculateRiskLevel(a.rsi14, displayScenarioLabel, a.newsSentiment)
    : null;

  const changeColor    = a && a.changePercent >= 0 ? "#4ADE80" : "#F87171";
  const scenarioBanner = SCENARIO_BANNER[displayScenarioLabel] ?? SCENARIO_BANNER["Neutral"];

  const metricsGrid = buildMetricsGrid(horizon, a);

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-gray-900">{stock.ticker}</h3>
            <span className="text-xs text-gray-400 font-medium">{HORIZON_LABELS[horizon]}</span>
          </div>
          {a && (() => {
            // Divisas sin símbolo conocido (DKK, SEK, CHF...) muestran su
            // código tras el importe — un "$" delante de un precio en DKK
            // hacía parecer que NOVO-B.CO cotizaba a 270 dólares.
            const SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", GBp: "£" };
            const symbol       = SYMBOLS[a.currency];
            const priceDisplay = symbol
              ? `${symbol}${a.price.toFixed(2)}`
              : `${a.price.toFixed(2)} ${a.currency}`;
            const priceUSDNote   = a.currency !== "USD" && a.priceUSD
              ? `(~$${a.priceUSD.toFixed(2)})`
              : "";
            return (
              <p className="mt-0.5 flex items-baseline gap-1.5 flex-wrap">
                <span style={{ fontSize: 22, fontWeight: 700, color: "var(--fg-1)" }}>
                  {priceDisplay}
                </span>
                {priceUSDNote && (
                  <span style={{ fontSize: 12, color: "var(--fg-5)" }}>
                    {priceUSDNote}
                  </span>
                )}
                <span style={{ fontSize: 14, fontWeight: 500, color: changeColor }}>
                  {a.changePercent >= 0 ? "+" : ""}{fmt(a.changePercent)}%
                </span>
              </p>
            );
          })()}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {riskLevel && <RiskBadge level={riskLevel} />}
          <StockUpdateMenu ticker={stock.ticker} />
          <RemoveStockButton ticker={stock.ticker} />
        </div>
      </div>

      {/* Horizon selector */}
      <HorizonSelector ticker={stock.ticker} current={horizon} />

      {/* Señal algorítmica */}
      {prescriptiveAction && prescriptiveAction.confidenceScore > 0 && actionStyle && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold tracking-wide ${actionStyle.badge}`}>
                {actionStyle.label}
              </span>
              {prescriptiveAction.executionPriceLimit > 0 && (() => {
                // El nivel de referencia está en la divisa de cotización del
                // activo, no siempre en USD (Novo: 280 DKK, no $280)
                const SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", GBp: "£" };
                const cur = a?.currency ?? "USD";
                const sym = SYMBOLS[cur];
                const lvl = prescriptiveAction.executionPriceLimit.toFixed(2);
                return (
                  <span className="text-xs text-gray-500">
                    Nivel ref. <span className="font-semibold text-gray-700">{sym ? `${sym}${lvl}` : `${lvl} ${cur}`}</span>
                  </span>
                );
              })()}
            </div>
            <span className="text-xs text-gray-400">
              ~{prescriptiveAction.estimatedHorizonDays}d
            </span>
          </div>

          {/* Barra de confianza */}
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Confianza algorítmica</span>
              <span className="font-medium text-gray-700">{prescriptiveAction.confidenceScore}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--background)" }}>
              <div
                className={`h-full rounded-full transition-all ${actionStyle.bar}`}
                style={{ width: `${prescriptiveAction.confidenceScore}%` }}
              />
            </div>
          </div>

          {prescriptiveAction.quantitativeJustification && (
            <p className="text-xs text-gray-600 leading-relaxed">
              {prescriptiveAction.quantitativeJustification}
            </p>
          )}

          <p className="text-xs text-gray-400 italic">
            Proyección algorítmica informativa — no constituye asesoramiento financiero.
          </p>
        </div>
      )}

      {!a && (
        <p className="text-sm text-gray-500 italic">
          Sin análisis disponible. Pulsa «Actualizar datos».
        </p>
      )}

      {a && (
        <>
          {/* Métricas según horizonte */}
          <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-5">
            {metricsGrid.map(({ label, value }) => (
              <div
                key={label}
                className="bg-white rounded-lg py-2 px-2 border border-slate-100"
              >
                <p className="text-xs text-gray-500 truncate">{label}</p>
                <p className="text-sm font-semibold text-gray-800">{value}</p>
              </div>
            ))}
          </div>

          {/* Banner horizonte obsoleto (solo para registros sin allHorizons) */}
          {isStaleHorizon && (
            <div style={{ borderRadius: 8, border: "1px solid rgba(245,158,11,.35)", background: "rgba(245,158,11,.10)", padding: "8px 12px", fontSize: 12, color: "#FCD34D" }}>
              Los datos guardados son de <strong>{HORIZON_LABELS[storedHorizon!]}</strong>.
              Pulsa «Actualizar datos» para analizar en <strong>{HORIZON_LABELS[horizon]}</strong>.
            </div>
          )}

          {/* Banner análisis parcial */}
          {isPartialAnalysis ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 italic">
              Análisis de IA no disponible temporalmente. Pulsa «Actualizar datos» cuando la cuota se haya recuperado.
            </div>
          ) : (
            <>
              {/* Alerta de divergencia técnico-sentimiento (IA) */}
              {displayDivergenceAlert && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", borderRadius: 8, border: "1px solid rgba(245,158,11,.4)", background: "rgba(245,158,11,.1)", padding: "9px 12px", fontSize: 13, color: "#FCD34D", lineHeight: 1.5 }}>
                  <span style={{ flexShrink: 0, marginTop: 1 }}>⚠</span>
                  <span>
                    <strong>Divergencia técnico-fundamental detectada.</strong>{" "}
                    Los indicadores técnicos y el sentimiento noticioso apuntan en direcciones opuestas.
                  </span>
                </div>
              )}

              {/* Badge de divergencia clásica precio/RSI */}
              {priceRsiDivergence && (() => {
                const db = DIVERGENCE_BADGE[priceRsiDivergence.type];
                return db ? (
                  <span
                    title={priceRsiDivergence.description}
                    style={{ alignSelf: "flex-start", display: "inline-flex", gap: 6, alignItems: "center", borderRadius: 9999, border: `1px solid ${db.bd}`, background: db.bg, color: db.fg, padding: "3px 11px", fontSize: 11, fontWeight: 600 }}
                  >
                    {priceRsiDivergence.type.replace(/_/g, " ")}
                    <span style={{ opacity: 0.6 }}>· {priceRsiDivergence.strength}</span>
                  </span>
                ) : null;
              })()}

              {/* Escenario */}
              <div style={{ borderRadius: 8, border: `1px solid ${scenarioBanner.bd}`, background: scenarioBanner.bg, color: scenarioBanner.fg, padding: "9px 12px", fontSize: 13, lineHeight: 1.5 }}>
                <strong>Escenario {displayScenarioLabel}:</strong>{" "}
                {displayScenarioJust}
              </div>

              {/* Análisis IA */}
              <p className="text-sm text-gray-700 leading-relaxed">{displayAnalysisText}</p>

              {/* Encaje con horizonte */}
              {displayHorizonMatch && (
                <div style={{ borderRadius: 8, border: "1px solid rgba(37,99,235,.3)", background: "rgba(37,99,235,.12)", padding: "9px 12px", fontSize: 12, color: "#93C5FD", lineHeight: 1.5 }}>
                  <strong>Encaje con {HORIZON_LABELS[horizon]}:</strong>{" "}
                  {displayHorizonMatch}
                </div>
              )}

              {/* Alerta de solapamiento de cartera */}
              {displayPortfolioAlert && (
                <div style={{ borderRadius: 8, border: "1px solid rgba(249,115,22,.4)", background: "rgba(249,115,22,.1)", padding: "9px 12px", fontSize: 12, color: "#FDBA74", lineHeight: 1.5 }}>
                  <strong>Riesgo de cartera:</strong>{" "}{displayPortfolioAlert}
                </div>
              )}

              {/* Key metrics chips */}
              {displayKeyMetrics.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {displayKeyMetrics.map((m) => (
                    <span
                      key={m}
                      style={{ borderRadius: 9999, background: "var(--card-inner)", color: "var(--fg-4)", padding: "4px 11px", fontSize: 12 }}
                    >
                      {m}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Noticias */}
          {a.newsSummary !== "Resumen de noticias no disponible." && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-medium text-gray-500 mb-1">
                Noticias recientes · Sentimiento:{" "}
                <span
                  style={{ color: a.newsSentiment === "Positivo" ? "#4ADE80" : a.newsSentiment === "Negativo" ? "#F87171" : "#FBBF24" }}
                >
                  {a.newsSentiment}
                </span>
              </p>
              <p className="text-xs text-gray-600 leading-relaxed">{a.newsSummary}</p>
            </div>
          )}

          {/* Panel de transacciones — precio SIEMPRE en USD: las transacciones
              se almacenan en USD y mezclar divisas inflaba el valor actual
              (NOVO: 12 × 282,55 DKK mostrado como 3.390 US$) */}
          <TransactionPanel
            stockId={stock.id}
            ticker={stock.ticker}
            currentPrice={a ? (a.priceUSD ?? a.price) : null}
          />

          {/* Footer: timestamp + enlace historial */}
          <div className="flex items-center justify-between">
            <Link
              href={`/dashboard/${stock.ticker}`}
              className="text-xs text-blue-500 hover:text-blue-700 hover:underline"
            >
              Ver historial →
            </Link>
            <p className="text-xs text-gray-400">
              Actualizado: {new Date(a.updatedAt).toLocaleString("es-ES")}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
