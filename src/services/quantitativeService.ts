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
