import { dailyReturns, pearson } from "@/lib/portfolioMath";

// ── Índice Fear & Greed propietario ──────────────────────────────────────────
// Combina RSI (componente técnico contrarian) y sentimiento noticioso.
// Rango: 0 (extremo miedo) → 100 (extrema codicia)

export function calculateFearGreedScore(
  rsi: number,
  sentiment: "Positivo" | "Neutral" | "Negativo"
): number {
  const technicalComponent  = 100 - rsi;  // contrarian: RSI alto = codicia, RSI bajo = miedo
  const sentimentComponent  =
    sentiment === "Positivo" ? 90 :
    sentiment === "Negativo" ? 10 : 50;

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
  sharpeRatio: number;         // annualized (risk-free 3.5% BCE)
  volatility30d: number;       // annualized volatility as %
  portfolioWeight: number;     // % of total portfolio market value
  correlatedTickers: Array<{ ticker: string; correlationFactor: number }>;
}

const ANNUAL_RISK_FREE = 0.035;

export function calculatePortfolioQuantMetrics(
  historicalData: Record<string, number[]>,
  currentPrices: Record<string, number>,
  quantities: Record<string, number>
): PortfolioQuantMetrics[] {
  const tickers = Object.keys(historicalData);
  if (tickers.length === 0) return [];

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

    // Mean daily return
    const meanDaily = n > 0 ? ret.reduce((s, v) => s + v, 0) / n : 0;

    // Daily volatility (sample std dev)
    const variance = n > 1
      ? ret.reduce((s, v) => s + (v - meanDaily) ** 2, 0) / (n - 1)
      : 0;
    const dailyVol = Math.sqrt(variance);

    // Annualized metrics
    const annReturn = meanDaily * 252;
    const annVol    = dailyVol  * Math.sqrt(252);

    const sharpeRatio = annVol > 0
      ? parseFloat(((annReturn - ANNUAL_RISK_FREE) / annVol).toFixed(3))
      : 0;

    const volatility30d = parseFloat((annVol * 100).toFixed(2));

    // Portfolio weight by market value; fall back to equal-weight if no position data
    const myValue = (currentPrices[ticker] ?? 0) * (quantities[ticker] ?? 0);
    const portfolioWeight = totalValue > 0
      ? parseFloat(((myValue / totalValue) * 100).toFixed(1))
      : parseFloat((100 / tickers.length).toFixed(1));

    // Pairwise correlations with all other tickers in the portfolio
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
