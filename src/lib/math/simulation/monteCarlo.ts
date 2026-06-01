export interface MonteCarloResult {
  p10: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p90: number[];
  days: number;
  initialValue: number;
  /** Value at Risk at 95% confidence: max loss not exceeded 95% of the time */
  var95: number;
  /** Expected Shortfall (CVaR) at 95%: average loss in the worst 5% of outcomes */
  cvar95: number;
  /** Probability of portfolio value ending below initial value */
  probabilityOfLoss: number;
}

export interface MonteCarloConfig {
  mu: number;
  sigma: number;
  S0: number;
  horizonDays: number;
  monthlyContribution?: number;
  simulations?: number;
  /** Sampling distribution. Default: 'STUDENT_T' (fat tails, more conservative VaR). */
  distribution?: 'NORMAL' | 'STUDENT_T';
  /** Degrees of freedom for Student-t. Default 5 (calibrated to equity fat tails). */
  degreesOfFreedom?: number;
}

// ── Samplers ──────────────────────────────────────────────────────────────────

function sampleNormal(): number {
  // Box-Muller: u must be > 0 to avoid log(0)
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Student-t variate via independent normal / chi-squared ratio.
// Variance = df/(df-2) for df > 2; heavier tails than Normal for small df.
export function sampleStudentT(df: number): number {
  const u1 = Math.random(), u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  // Chi-squared: sum of df independent N(0,1)² values
  let chiSq = 0;
  for (let i = 0; i < df; i++) {
    const u3 = Math.random(), u4 = Math.random();
    const zi = Math.sqrt(-2 * Math.log(u3)) * Math.cos(2 * Math.PI * u4);
    chiSq += zi * zi;
  }
  return z / Math.sqrt(chiSq / df);
}

// ── Simulation ────────────────────────────────────────────────────────────────

export function runMonteCarlo(
  mu: number,
  sigma: number,
  S0: number,
  horizonDays: number,
  monthlyContribution = 0,
  simulations = 1000,
  distribution: 'NORMAL' | 'STUDENT_T' = 'STUDENT_T',
  degreesOfFreedom = 5
): MonteCarloResult {
  const paths: number[][] = [];
  const tradingDaysPerMonth = 21;

  for (let sim = 0; sim < simulations; sim++) {
    const path: number[] = [S0];
    let value = S0;
    for (let d = 1; d <= horizonDays; d++) {
      const sample = distribution === 'NORMAL'
        ? sampleNormal()
        : sampleStudentT(degreesOfFreedom);
      value *= Math.exp((mu - (sigma * sigma) / 2) + sigma * sample);
      if (monthlyContribution > 0 && d % tradingDaysPerMonth === 0) {
        value += monthlyContribution;
      }
      path.push(value);
    }
    paths.push(path);
  }

  // Compute percentiles day by day
  const percentile = (col: number[], pct: number) => {
    const sorted = [...col].sort((a, b) => a - b);
    const idx = Math.floor((pct / 100) * (sorted.length - 1));
    return sorted[idx];
  };

  const p10: number[] = [];
  const p25: number[] = [];
  const p50: number[] = [];
  const p75: number[] = [];
  const p90: number[] = [];

  for (let d = 0; d <= horizonDays; d++) {
    const col = paths.map((p) => p[d]);
    p10.push(percentile(col, 10));
    p25.push(percentile(col, 25));
    p50.push(percentile(col, 50));
    p75.push(percentile(col, 75));
    p90.push(percentile(col, 90));
  }

  // CVaR / Expected Shortfall at 95% confidence
  // Computed from final values across all simulations
  const finalValues = paths.map((p) => p[horizonDays]).sort((a, b) => a - b);
  const varIdx = Math.floor(0.05 * finalValues.length);
  const var95 = parseFloat((S0 - finalValues[varIdx]).toFixed(2));
  const cvar95 = parseFloat(
    (S0 - finalValues.slice(0, varIdx + 1).reduce((s, v) => s + v, 0) / (varIdx + 1)).toFixed(2)
  );
  const probabilityOfLoss = parseFloat(
    (finalValues.filter((v) => v < S0).length / finalValues.length).toFixed(4)
  );

  return { p10, p25, p50, p75, p90, days: horizonDays, initialValue: S0, var95, cvar95, probabilityOfLoss };
}
