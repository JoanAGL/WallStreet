import { dailyReturns, pearson } from "@/lib/portfolioMath";

// ── EWMA Volatility ───────────────────────────────────────────────────────────
// Exponentially Weighted Moving Average with λ=0.94 (RiskMetrics standard).
// More reactive to recent market events than simple historical std dev.
const EWMA_LAMBDA = 0.94;

function ewmaVariance(returns: number[]): number {
  if (returns.length === 0) return 0;
  let variance = returns[0] ** 2;
  for (let i = 1; i < returns.length; i++) {
    variance = EWMA_LAMBDA * variance + (1 - EWMA_LAMBDA) * returns[i] ** 2;
  }
  return variance;
}

// ── Dynamic risk-free rate ────────────────────────────────────────────────────
// Reads T-bill proxy from env, defaults to 3.5%.
// Set RISK_FREE_RATE_ANNUAL=0.053 in Vercel env to reflect current Fed funds rate.
function getAnnualRiskFreeRate(): number {
  const envRate = process.env.RISK_FREE_RATE_ANNUAL;
  if (envRate) {
    const parsed = parseFloat(envRate);
    if (isFinite(parsed) && parsed >= 0 && parsed < 1) return parsed;
  }
  return 0.035;
}

// ── Índice Fear & Greed propietario ──────────────────────────────────────────
// Combina RSI (componente técnico contrarian) y sentimiento noticioso.
// Rango: 0 (extremo miedo) → 100 (extrema codicia)

export function calculateFearGreedScore(
  rsi: number,
  sentiment: "Positivo" | "Neutral" | "Negativo"
): number {
  const technicalComponent = 100 - rsi; // contrarian: RSI alto = codicia, RSI bajo = miedo
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
  /** Annualized EWMA volatility (λ=0.94) as % — more reactive than simple std dev */
  volatility30d: number;
  portfolioWeight: number;
  correlatedTickers: Array<{ ticker: string; correlationFactor: number }>;
}

export function calculatePortfolioQuantMetrics(
  historicalData: Record<string, number[]>,
  currentPrices: Record<string, number>,
  quantities: Record<string, number>
): PortfolioQuantMetrics[] {
  const tickers = Object.keys(historicalData);
  if (tickers.length === 0) return [];

  const riskFree = getAnnualRiskFreeRate();

  // Daily returns for each ticker
  const returnsMap: Record<string, number[]> = {};
  for (const t of tickers) {
    returnsMap[t] = dailyReturns(historicalData[t]);
  }

  // Total portfolio market value (for weight calc)
  const totalValue = tickers.reduce(
    (sum, t) => sum + (currentPrices[t] ?? 0) * (quantities[t] ?? 0),
    0
  );

  return tickers.map((ticker) => {
    const ret = returnsMap[ticker];
    const n = ret.length;

    // Mean daily return (for annualized return estimate)
    const meanDaily = n > 0 ? ret.reduce((s, v) => s + v, 0) / n : 0;
    const annReturn = meanDaily * 252;

    // EWMA daily variance → annualized volatility
    const dailyVarEWMA = ewmaVariance(ret);
    const annVol = Math.sqrt(dailyVarEWMA * 252);

    const sharpeRatio =
      annVol > 0 ? parseFloat(((annReturn - riskFree) / annVol).toFixed(3)) : 0;

    const volatility30d = parseFloat((annVol * 100).toFixed(2));

    // Portfolio weight by market value; equal-weight fallback when no position data
    const myValue = (currentPrices[ticker] ?? 0) * (quantities[ticker] ?? 0);
    const portfolioWeight =
      totalValue > 0
        ? parseFloat(((myValue / totalValue) * 100).toFixed(1))
        : parseFloat((100 / tickers.length).toFixed(1));

    // Pairwise correlations with all other tickers
    const correlatedTickers = tickers
      .filter((t) => t !== ticker)
      .map((t) => ({
        ticker: t,
        correlationFactor: parseFloat(pearson(returnsMap[ticker], returnsMap[t]).toFixed(3)),
      }))
      .sort((a, b) => Math.abs(b.correlationFactor) - Math.abs(a.correlationFactor));

    return { ticker, sharpeRatio, volatility30d, portfolioWeight, correlatedTickers };
  });
}

/** Returns the PortfolioQuantMetrics for a single ticker, or null if not found. */
export function findTickerMetrics(
  allMetrics: PortfolioQuantMetrics[],
  ticker: string
): PortfolioQuantMetrics | null {
  return allMetrics.find((m) => m.ticker === ticker) ?? null;
}
