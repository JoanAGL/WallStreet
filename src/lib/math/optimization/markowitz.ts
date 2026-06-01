import { dailyReturns } from "../returns";

export interface OptimizationResult {
  tickers: string[];
  currentWeights: number[];
  optimalWeights: number[];
  currentReturn: number;    // annualized
  optimalReturn: number;
  currentVol: number;       // annualized
  optimalVol: number;
  currentSharpe: number;
  optimalSharpe: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

export function dot(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

export function matVec(A: number[][], v: number[]): number[] {
  return A.map((row) => dot(row, v));
}

export function portfolioVariance(weights: number[], cov: number[][]): number {
  return dot(weights, matVec(cov, weights));
}

export function portfolioReturn(weights: number[], mus: number[]): number {
  return dot(weights, mus);
}

// Ledoit-Wolf constant-correlation shrinkage (simplified)
export function shrinkCovariance(cov: number[][], alpha = 0.2): number[][] {
  const k = cov.length;
  const variances = cov.map((row, i) => row[i]);
  const avgCorr =
    variances.length > 1
      ? cov.reduce((sum, row, i) => {
          const si = Math.sqrt(variances[i]);
          return (
            sum +
            row.reduce((rs, val, j) => {
              if (i === j) return rs;
              const sj = Math.sqrt(variances[j]);
              return rs + (si > 0 && sj > 0 ? val / (si * sj) : 0);
            }, 0)
          );
        }, 0) /
        (k * (k - 1))
      : 0;

  return cov.map((row, i) =>
    row.map((val, j) => {
      if (i === j) return val;
      const target = avgCorr * Math.sqrt(variances[i] * variances[j]);
      return (1 - alpha) * val + alpha * target;
    })
  );
}

function projectSimplex(v: number[]): number[] {
  const n = v.length;
  const sorted = [...v].sort((a, b) => b - a);
  let cumsum = 0;
  let rho = 0;
  for (let i = 0; i < n; i++) {
    cumsum += sorted[i];
    if (sorted[i] - (cumsum - 1) / (i + 1) > 0) rho = i;
  }
  const theta = (sorted.slice(0, rho + 1).reduce((s, x) => s + x, 0) - 1) / (rho + 1);
  return v.map((x) => Math.max(x - theta, 0));
}

// Gradient descent minimization of portfolio variance subject to weight constraints
export function minimizeVariance(
  mus: number[],
  cov: number[][],
  targetReturn: number | null,
  lr = 0.01,
  steps = 3000
): number[] {
  const k = mus.length;
  let w = new Array<number>(k).fill(1 / k);

  for (let step = 0; step < steps; step++) {
    // Gradient of variance = 2 * Σ * w
    const grad = matVec(cov, w).map((v) => 2 * v);

    // If targeting return, add Lagrange penalty
    if (targetReturn !== null) {
      const retGap = portfolioReturn(w, mus) - targetReturn;
      grad.forEach((_, i) => { grad[i] -= retGap * mus[i] * 0.5; });
    }

    // Update
    w = w.map((wi, i) => wi - lr * grad[i]);

    // Project onto simplex (sum=1, w>=0)
    w = projectSimplex(w);
  }
  return w;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function runPortfolioOptimization(
  historicalData: Record<string, number[]>,
  currentValues: Record<string, number>,  // ticker -> market value
  riskFreeRate = 0.035 / 252              // daily BCE rate
): OptimizationResult {
  const tickers = Object.keys(historicalData);
  const k = tickers.length;
  const allReturns = tickers.map((t) => dailyReturns(historicalData[t]));

  // Compute mean daily returns
  const mus = allReturns.map((r) => r.reduce((s, v) => s + v, 0) / r.length);

  // Compute covariance matrix
  const n = allReturns[0].length;
  const cov: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      let c = 0;
      for (let t = 0; t < Math.min(allReturns[i].length, allReturns[j].length); t++) {
        c += (allReturns[i][t] - mus[i]) * (allReturns[j][t] - mus[j]);
      }
      c /= n - 1;
      cov[i][j] = c;
      cov[j][i] = c;
    }
  }

  // Shrink covariance
  const covShrunk = shrinkCovariance(cov);

  // Current weights by market value
  const totalValue = Object.values(currentValues).reduce((s, v) => s + v, 0);
  const currentWeights = tickers.map((t) => (currentValues[t] ?? 0) / (totalValue || 1));

  // Optimal weights — minimize variance
  const optimalWeights = minimizeVariance(mus, covShrunk, null);

  const annualFactor = 252;
  const sqrt252 = Math.sqrt(annualFactor);

  const currentReturn = portfolioReturn(currentWeights, mus) * annualFactor;
  const optimalReturn = portfolioReturn(optimalWeights, mus) * annualFactor;
  const currentVol    = Math.sqrt(portfolioVariance(currentWeights, covShrunk)) * sqrt252;
  const optimalVol    = Math.sqrt(portfolioVariance(optimalWeights, covShrunk)) * sqrt252;

  const sharpe = (ret: number, vol: number) =>
    vol > 0 ? (ret - riskFreeRate * annualFactor) / vol : 0;

  return {
    tickers,
    currentWeights,
    optimalWeights,
    currentReturn,
    optimalReturn,
    currentVol,
    optimalVol,
    currentSharpe: sharpe(currentReturn, currentVol),
    optimalSharpe: sharpe(optimalReturn, optimalVol),
  };
}
