// ── Historical Stress Scenarios ───────────────────────────────────────────────
// Applies known historical drawdown profiles to a portfolio value.
// Returns the simulated final value after each crisis, not a path.

export interface StressScenario {
  name: string;
  /** Peak-to-trough drawdown as a positive decimal (e.g. 0.56 = 56% drop) */
  drawdown: number;
  /** Trading days from peak to trough */
  durationDays: number;
  /** Annualized volatility during the crisis period */
  crisisVolatility: number;
}

export interface StressTestResult {
  scenario: string;
  drawdown: number;
  portfolioLoss: number;       // USD loss from initial value
  finalValue: number;
  durationDays: number;
  recoveryDays: number | null; // estimated trading days to recover (null if > 5 years)
}

// Source: empirical S&P 500 data for each event
const HISTORICAL_SCENARIOS: StressScenario[] = [
  { name: "2008 Financial Crisis",     drawdown: 0.565, durationDays: 356, crisisVolatility: 0.65 },
  { name: "2020 COVID Crash",          drawdown: 0.340, durationDays: 33,  crisisVolatility: 0.83 },
  { name: "2022 Rate Hike Bear Market",drawdown: 0.255, durationDays: 282, crisisVolatility: 0.29 },
  { name: "2000 Dot-com Bust",         drawdown: 0.491, durationDays: 638, crisisVolatility: 0.28 },
  { name: "1987 Black Monday",         drawdown: 0.336, durationDays: 101, crisisVolatility: 0.60 },
];

export function runStressTests(
  portfolioValue: number,
  annualMu: number    // expected annual return (post-crisis), used for recovery estimate
): StressTestResult[] {
  return HISTORICAL_SCENARIOS.map((scenario) => {
    const portfolioLoss = portfolioValue * scenario.drawdown;
    const finalValue = portfolioValue - portfolioLoss;

    // Estimate recovery time: how many trading days to get back to initial value
    // using the post-crisis drift (annualMu) and normal volatility
    let recoveryDays: number | null = null;
    if (annualMu > 0) {
      const dailyMu = annualMu / 252;
      // days needed: finalValue * (1 + dailyMu)^n = portfolioValue → n = log(pv/fv) / log(1+mu)
      const n = Math.log(portfolioValue / finalValue) / Math.log(1 + dailyMu);
      recoveryDays = n <= 1260 ? Math.ceil(n) : null; // cap at 5 years
    }

    return {
      scenario: scenario.name,
      drawdown: scenario.drawdown,
      portfolioLoss: parseFloat(portfolioLoss.toFixed(2)),
      finalValue: parseFloat(finalValue.toFixed(2)),
      durationDays: scenario.durationDays,
      recoveryDays,
    };
  });
}
