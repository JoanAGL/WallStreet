import { dailyReturns, pearson } from "@/lib/portfolioMath";

// ── GARCH(1,1) Volatility ─────────────────────────────────────────────────────
// Generalized AutoRegressive Conditional Heteroskedasticity.
// Captures volatility clustering better than EWMA because it models both
// short-term shock reaction (α) and long-run persistence (β) separately.
//
// σ²_t = ω + α·r²_{t-1} + β·σ²_{t-1}
// ω = (1 − α − β) · long_run_var  (ensures stationarity: α + β < 1)
//
// Standard values: α=0.09, β=0.90 (sum=0.99, high persistence, low reaction)
const GARCH_ALPHA = 0.09;
const GARCH_BETA  = 0.90;

function garchVariance(returns: number[]): number {
  if (returns.length === 0) return 0;
  const n = returns.length;
  const longRunVar = returns.reduce((s, r) => s + r * r, 0) / n;
  const omega = (1 - GARCH_ALPHA - GARCH_BETA) * longRunVar;
  let sigma2 = longRunVar; // seed at unconditional variance
  for (let i = 0; i < n; i++) {
    sigma2 = omega + GARCH_ALPHA * returns[i] ** 2 + GARCH_BETA * sigma2;
  }
  return sigma2; // conditional variance forecast for next period
}

// ── Dynamic risk-free rate ────────────────────────────────────────────────────
// Set RISK_FREE_RATE_ANNUAL=0.053 in Vercel env to reflect current Fed funds rate.
export function getAnnualRiskFreeRate(): number {
  const envRate = process.env.RISK_FREE_RATE_ANNUAL;
  if (envRate) {
    const parsed = parseFloat(envRate);
    if (isFinite(parsed) && parsed >= 0 && parsed < 1) return parsed;
  }
  return 0.035;
}

// ── Kelly Criterion ───────────────────────────────────────────────────────────
// Continuous-time Kelly fraction: f* = (μ − r) / σ²
// Gives the theoretically optimal fraction of capital to allocate to an asset.
// Capped at 1.0 (no leverage) and floored at 0 (no shorting in this context).
export function kellyFraction(
  expectedAnnualReturn: number,
  annualVariance: number,
  riskFreeRate = getAnnualRiskFreeRate()
): number {
  if (annualVariance <= 0) return 0;
  const excess = expectedAnnualReturn - riskFreeRate;
  return parseFloat(Math.min(1, Math.max(0, excess / annualVariance)).toFixed(4));
}

// ── Índice Fear & Greed propietario ──────────────────────────────────────────
export function calculateFearGreedScore(
  rsi: number,
  sentiment: "Positivo" | "Neutral" | "Negativo"
): number {
  const technicalComponent = 100 - rsi;
  const sentimentComponent =
    sentiment === "Positivo" ? 90 : sentiment === "Negativo" ? 10 : 50;
  return Math.round(technicalComponent * 0.4 + sentimentComponent * 0.6);
}

export function fearGreedLabel(score: number): string {
  if (score >= 75) return "Extrema codicia";
  if (score >= 55) return "Codicia";
  if (score >= 45) return "Neutral";
  if (score >= 25) return "Miedo";
  return "Extremo miedo";
}

export interface PortfolioQuantMetrics {
  ticker: string;
  /** Annualized Sharpe ratio (dynamic risk-free rate from RISK_FREE_RATE_ANNUAL env) */
  sharpeRatio: number;
  /** Annualized GARCH(1,1) conditional volatility as % */
  volatility30d: number;
  portfolioWeight: number;
  correlatedTickers: Array<{ ticker: string; correlationFactor: number }>;
  /** Kelly Criterion optimal position fraction 0–1 (unconstrained) */
  kellyFraction: number;
}

export function calculatePortfolioQuantMetrics(
  historicalData: Record<string, number[]>,
  currentPrices: Record<string, number>,
  quantities: Record<string, number>
): PortfolioQuantMetrics[] {
  const tickers = Object.keys(historicalData);
  if (tickers.length === 0) return [];

  const riskFree = getAnnualRiskFreeRate();

  const returnsMap: Record<string, number[]> = {};
  for (const t of tickers) {
    returnsMap[t] = dailyReturns(historicalData[t]);
  }

  const totalValue = tickers.reduce(
    (sum, t) => sum + (currentPrices[t] ?? 0) * (quantities[t] ?? 0),
    0
  );

  return tickers.map((ticker) => {
    const ret = returnsMap[ticker];
    const n = ret.length;

    const meanDaily = n > 0 ? ret.reduce((s, v) => s + v, 0) / n : 0;
    const annReturn = meanDaily * 252;

    // GARCH(1,1) daily conditional variance → annualized
    const dailyVarGARCH = garchVariance(ret);
    const annVar = dailyVarGARCH * 252;
    const annVol = Math.sqrt(annVar);

    const sharpeRatio =
      annVol > 0 ? parseFloat(((annReturn - riskFree) / annVol).toFixed(3)) : 0;

    const volatility30d = parseFloat((annVol * 100).toFixed(2));

    const myValue = (currentPrices[ticker] ?? 0) * (quantities[ticker] ?? 0);
    const portfolioWeight =
      totalValue > 0
        ? parseFloat(((myValue / totalValue) * 100).toFixed(1))
        : parseFloat((100 / tickers.length).toFixed(1));

    const correlatedTickers = tickers
      .filter((t) => t !== ticker)
      .map((t) => ({
        ticker: t,
        correlationFactor: parseFloat(pearson(returnsMap[ticker], returnsMap[t]).toFixed(3)),
      }))
      .sort((a, b) => Math.abs(b.correlationFactor) - Math.abs(a.correlationFactor));

    const kelly = kellyFraction(annReturn, annVar, riskFree);

    return { ticker, sharpeRatio, volatility30d, portfolioWeight, correlatedTickers, kellyFraction: kelly };
  });
}

/** Returns the PortfolioQuantMetrics for a single ticker, or null if not found. */
export function findTickerMetrics(
  allMetrics: PortfolioQuantMetrics[],
  ticker: string
): PortfolioQuantMetrics | null {
  return allMetrics.find((m) => m.ticker === ticker) ?? null;
}

// ── Peter Lynch PEG Ratio ─────────────────────────────────────────────────────

export type PegClassification =
  | "ULTRA_GANGA"
  | "INFRAVALORADA"
  | "JUSTA"
  | "SOBREVALORADA"
  | "NO_DISPONIBLE";

export interface PegInsight {
  /** Computed PEG value; 0 when unavailable */
  pegRatio: number;
  valuationStatus: PegClassification;
  /** Conviction score per Lynch thresholds: 100 | 85 | 60 | 20 | 50 (unavailable) */
  pegScore: number;
}

const NO_PEG: PegInsight = { pegRatio: 0, valuationStatus: "NO_DISPONIBLE", pegScore: 50 };

function applyLynchThresholds(peg: number): PegInsight {
  if (peg < 0.5)  return { pegRatio: peg, valuationStatus: "ULTRA_GANGA",   pegScore: 100 };
  if (peg < 1.0)  return { pegRatio: peg, valuationStatus: "INFRAVALORADA", pegScore: 85 };
  if (peg <= 1.5) return { pegRatio: peg, valuationStatus: "JUSTA",         pegScore: 60 };
  return             { pegRatio: peg, valuationStatus: "SOBREVALORADA",  pegScore: 20 };
}

/**
 * Classifies a pre-computed PEG ratio using Peter Lynch thresholds.
 * Returns NO_DISPONIBLE (pegScore 50) for null, non-finite, zero, or negative inputs.
 */
export function classifyPegValue(peg: number | null | undefined): PegInsight {
  if (peg == null || !isFinite(peg) || peg <= 0) return NO_PEG;
  return applyLynchThresholds(peg);
}

/**
 * Computes and classifies the Peter Lynch PEG ratio from raw components.
 * @param per       - Price-to-Earnings ratio (must be > 0 and finite)
 * @param epsGrowth - Expected EPS growth as integer percentage, e.g. 15 for 15% (must be > 0)
 * Returns NO_DISPONIBLE (pegScore 50) if either input is invalid.
 */
export function calculatePeterLynchPeg(per: number, epsGrowth: number): PegInsight {
  if (!isFinite(per) || per <= 0 || !isFinite(epsGrowth) || epsGrowth <= 0) return NO_PEG;
  return applyLynchThresholds(per / epsGrowth);
}

// ── Market Regime Classifier (Hurst + GARCH + RSI) — issue #49 ────────────────

/**
 * Régimen de mercado combinado. A diferencia del MarketRegime de
 * technicalAnalysisService (solo Hurst), este clasificador cruza persistencia
 * (Hurst), momentum (RSI14), actividad (volumen relativo) y volatilidad
 * condicional GARCH(1,1) anualizada.
 */
export type CombinedMarketRegime =
  | "TRENDING_BULL"
  | "TRENDING_BEAR"
  | "MEAN_REVERTING"
  | "RANDOM_WALK"
  | "HIGH_VOLATILITY"
  | "VOLATILITY_CRUSH";

/**
 * Clasifica el régimen de mercado de un activo.
 *
 * Umbrales:
 * - garchVolAnnualized > 0.40 (40% anualizada) o relativeVolume > 3 → HIGH_VOLATILITY
 * - garchVolAnnualized < 0.15 → VOLATILITY_CRUSH
 * - hurst > 0.6 y RSI > 55 → TRENDING_BULL
 * - hurst > 0.6 y RSI < 45 → TRENDING_BEAR
 * - hurst < 0.45 → MEAN_REVERTING
 * - resto → RANDOM_WALK
 *
 * @param hurstExponent      Exponente de Hurst (R/S), típicamente 0.3–0.7
 * @param rsi14              RSI de 14 períodos, 0–100
 * @param relativeVolume     Volumen relativo vs media 20 sesiones (1 = normal)
 * @param garchVolAnnualized Volatilidad GARCH(1,1) anualizada como FRACCIÓN (0.40 = 40%)
 */
export function classifyRegime(
  hurstExponent: number,
  rsi14: number,
  relativeVolume: number,
  garchVolAnnualized: number
): CombinedMarketRegime {
  // Un pico de volumen >3× corrobora un evento de volatilidad aunque la
  // GARCH (ventana 60d) aún no lo haya capturado del todo
  if (garchVolAnnualized > 0.40 || relativeVolume > 3) return "HIGH_VOLATILITY";
  if (garchVolAnnualized < 0.15) return "VOLATILITY_CRUSH";
  if (hurstExponent > 0.6 && rsi14 > 55) return "TRENDING_BULL";
  if (hurstExponent > 0.6 && rsi14 < 45) return "TRENDING_BEAR";
  if (hurstExponent < 0.45) return "MEAN_REVERTING";
  return "RANDOM_WALK";
}

/** Sesgo por régimen inyectado en el prompt de Gemini (~15 tokens por activo). */
export const REGIME_BIAS: Record<CombinedMarketRegime, string> = {
  TRENDING_BULL:    "Bias toward POSITIVE short-term scenario.",
  TRENDING_BEAR:    "Bias toward NEGATIVE short-term scenario.",
  MEAN_REVERTING:   "NEUTRAL scenario has highest statistical weight.",
  RANDOM_WALK:      "Scenarios equiprobable; widen confidence intervals.",
  HIGH_VOLATILITY:  "Widen price target ranges; increase scenario dispersion.",
  VOLATILITY_CRUSH: "Narrow price target ranges; low dispersion expected.",
};

/**
 * Variante tolerante a datos ausentes para el pipeline: devuelve null si
 * faltan Hurst o RSI (sin ellos el régimen no es interpretable). El volumen
 * relativo ausente se asume 1 (normal) y la GARCH ausente 0.25 (zona neutra).
 */
export function classifyRegimeSafe(
  hurstExponent: number | null | undefined,
  rsi14: number | null | undefined,
  relativeVolume: number | null | undefined,
  garchVolAnnualizedPct: number | null | undefined  // en %, como volatility30d
): CombinedMarketRegime | null {
  if (hurstExponent == null || rsi14 == null) return null;
  return classifyRegime(
    hurstExponent,
    rsi14,
    relativeVolume ?? 1,
    garchVolAnnualizedPct != null ? garchVolAnnualizedPct / 100 : 0.25
  );
}
