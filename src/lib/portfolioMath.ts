// Pure math functions for portfolio analysis — no external dependencies.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CorrelationResult {
  tickers: string[];
  matrix: number[][];
  highPairs: { a: string; b: string; correlation: number }[];
}

export interface HarvestAlert {
  ticker: string;
  latentLoss: number;      // negative number, in USD
  purchasePrice: number;
  currentPrice: number;
  quantity: number;
  alternative?: string;    // suggested ETF
}

export interface MonteCarloResult {
  p10: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p90: number[];
  days: number;
  initialValue: number;
}

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

// ── Correlation Matrix (#36) ─────────────────────────────────────────────────

export function dailyReturns(closes: number[]): number[] {
  const ret: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    ret.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return ret;
}

export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const meanA = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const meanB = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let num = 0, stdA = 0, stdB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    stdA += da * da;
    stdB += db * db;
  }
  if (stdA === 0 || stdB === 0) return 0;
  return num / Math.sqrt(stdA * stdB);
}

export function calculateCorrelationMatrix(
  historicalData: Record<string, number[]>
): CorrelationResult {
  const tickers = Object.keys(historicalData);
  const returns = tickers.map((t) => dailyReturns(historicalData[t]));
  const n = tickers.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      matrix[i][j] = i === j ? 1.0 : parseFloat(pearson(returns[i], returns[j]).toFixed(4));
    }
  }

  const highPairs: CorrelationResult["highPairs"] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (matrix[i][j] > 0.75) {
        highPairs.push({ a: tickers[i], b: tickers[j], correlation: matrix[i][j] });
      }
    }
  }

  return { tickers, matrix, highPairs };
}

// ── Tax Harvesting Detection (#38) ───────────────────────────────────────────

const ETF_ALTERNATIVES: Record<string, string> = {
  AAPL: "QQQ",  MSFT: "QQQ",  GOOGL: "QQQ", AMZN: "QQQ", META: "QQQ",
  NVDA: "SOXX", AMD: "SOXX",  INTC: "SOXX",
  TSLA: "XLY",  GM: "XLY",   F: "XLY",
  JPM: "XLF",   BAC: "XLF",  GS: "XLF",   MS: "XLF",
  JNJ: "XLV",   PFE: "XLV",  UNH: "XLV",
  XOM: "XLE",   CVX: "XLE",
  WMT: "XLP",   PG: "XLP",   KO: "XLP",
};

const HARVEST_THRESHOLD = 100; // USD

export function detectHarvestOpportunities(
  stocks: { ticker: string; purchasePrice: number | null; currentPrice: number; quantity: number | null }[]
): HarvestAlert[] {
  const alerts: HarvestAlert[] = [];
  for (const s of stocks) {
    if (s.purchasePrice == null || s.quantity == null) continue;
    const latentLoss = (s.currentPrice - s.purchasePrice) * s.quantity;
    if (latentLoss < -HARVEST_THRESHOLD) {
      alerts.push({
        ticker: s.ticker,
        latentLoss,
        purchasePrice: s.purchasePrice,
        currentPrice: s.currentPrice,
        quantity: s.quantity,
        alternative: ETF_ALTERNATIVES[s.ticker.toUpperCase()],
      });
    }
  }
  return alerts.sort((a, b) => a.latentLoss - b.latentLoss); // worst first
}

// ── Monte Carlo Simulation (#37) ─────────────────────────────────────────────

function sampleNormal(): number {
  // Box-Muller transform
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function runMonteCarlo(
  mu: number,      // daily mean return
  sigma: number,   // daily volatility
  S0: number,      // initial portfolio value
  horizonDays: number,
  monthlyContribution = 0,
  simulations = 1000
): MonteCarloResult {
  const paths: number[][] = [];
  const tradingDaysPerMonth = 21;

  for (let sim = 0; sim < simulations; sim++) {
    const path: number[] = [S0];
    let value = S0;
    for (let d = 1; d <= horizonDays; d++) {
      value *= Math.exp((mu - (sigma * sigma) / 2) + sigma * sampleNormal());
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

  return { p10, p25, p50, p75, p90, days: horizonDays, initialValue: S0 };
}

// ── Markowitz / HRP Portfolio Optimization (#39) ─────────────────────────────

function dot(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

function matVec(A: number[][], v: number[]): number[] {
  return A.map((row) => dot(row, v));
}

function portfolioVariance(weights: number[], cov: number[][]): number {
  return dot(weights, matVec(cov, weights));
}

function portfolioReturn(weights: number[], mus: number[]): number {
  return dot(weights, mus);
}

// Ledoit-Wolf constant-correlation shrinkage (simplified)
function shrinkCovariance(cov: number[][], alpha = 0.2): number[][] {
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

// Gradient descent minimization of portfolio variance subject to weight constraints
function minimizeVariance(
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

// ── Black-Litterman Model ─────────────────────────────────────────────────────

export interface BlackLittermanView {
  ticker: string;
  /** View on expected annual return, e.g. 0.12 for +12% */
  expectedAnnualReturn: number;
  /** Analyst confidence 0–1 (1 = certainty, lower = more uncertainty) */
  confidence: number;
}

export interface BlackLittermanResult extends OptimizationResult {
  /** BL posterior annualized means per ticker */
  blPosteriorMeans: Record<string, number>;
  /** Views fed into the model */
  views: BlackLittermanView[];
}

// ── Matrix helpers (pure, internal) ──────────────────────────────────────────

function matMul(A: number[][], B: number[][]): number[][] {
  const m = A.length, p = A[0].length, n = B[0].length;
  return Array.from({ length: m }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      Array.from({ length: p }, (_, l) => A[i][l] * B[l][j]).reduce((s, v) => s + v, 0)
    )
  );
}

function matAdd(A: number[][], B: number[][]): number[][] {
  return A.map((row, i) => row.map((v, j) => v + B[i][j]));
}

function matScale(A: number[][], s: number): number[][] {
  return A.map((row) => row.map((v) => v * s));
}

function transpose(A: number[][]): number[][] {
  return A[0].map((_, j) => A.map((row) => row[j]));
}

/** Gauss-Jordan matrix inverse. Returns null for singular matrices (n ≤ 25). */
function matInverse(A: number[][]): number[][] | null {
  const n = A.length;
  const aug = A.map((row, i) =>
    [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]
  );

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-12) return null;

    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = aug[row][col];
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= f * aug[col][j];
    }
  }
  return aug.map((row) => row.slice(n));
}

/**
 * Black-Litterman portfolio optimization.
 *
 * Prior: market-equilibrium returns (reverse-optimized from portfolio weights).
 * Views: absolute expected-return views on individual tickers, weighted by confidence.
 * Posterior: Bayesian blend of prior and views → fed into variance minimizer.
 *
 * Falls back to standard Markowitz if views are empty or matrices are singular.
 *
 * @param tau   Scaling parameter for prior uncertainty (default 0.05, standard)
 * @param delta Risk-aversion coefficient (default 2.5, matches institutional literature)
 */
export function runBlackLitterman(
  historicalData: Record<string, number[]>,
  currentValues: Record<string, number>,
  views: BlackLittermanView[],
  tau = 0.05,
  delta = 2.5,
  riskFreeRate = 0.035 / 252
): BlackLittermanResult {
  const tickers = Object.keys(historicalData);
  const k = tickers.length;
  const tickerIdx = Object.fromEntries(tickers.map((t, i) => [t, i]));
  const allReturns = tickers.map((t) => dailyReturns(historicalData[t]));
  const n = allReturns[0].length;

  const mus = allReturns.map((r) => r.reduce((s, v) => s + v, 0) / r.length);

  // Covariance matrix (daily) with Ledoit-Wolf shrinkage
  const cov: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      let c = 0;
      const len = Math.min(allReturns[i].length, allReturns[j].length);
      for (let t = 0; t < len; t++) {
        c += (allReturns[i][t] - mus[i]) * (allReturns[j][t] - mus[j]);
      }
      c /= n - 1;
      cov[i][j] = c;
      cov[j][i] = c;
    }
  }
  const covShrunk = shrinkCovariance(cov);

  // Market weights from current values
  const totalValue = Object.values(currentValues).reduce((s, v) => s + v, 0);
  const w_m = tickers.map((t) => (currentValues[t] ?? 0) / (totalValue || 1));

  // Fallback helper — Markowitz result
  const markowitz = (): BlackLittermanResult => {
    const base = runPortfolioOptimization(historicalData, currentValues, riskFreeRate);
    return {
      ...base,
      blPosteriorMeans: Object.fromEntries(tickers.map((t, i) => [t, mus[i] * 252])),
      views,
    };
  };

  const validViews = views.filter((v) => tickerIdx[v.ticker] !== undefined);
  if (validViews.length === 0) return markowitz();

  // Equilibrium prior: π = δ * Σ_ann * w_m
  const covAnn = matScale(covShrunk.map((row) => [...row]), 252);
  const pi = matVec(covAnn, w_m).map((v) => v * delta);

  // Pick-matrix P (numViews × k): absolute views → identity pick per ticker
  const P: number[][] = validViews.map((v) => {
    const row = new Array<number>(k).fill(0);
    const idx = tickerIdx[v.ticker];
    if (idx !== undefined) row[idx] = 1;
    return row;
  });

  // Q vector: expected annual returns as column matrix
  const Q: number[][] = validViews.map((v) => [v.expectedAnnualReturn]);

  // Ω: view uncertainty, diagonal. Higher confidence → lower uncertainty.
  const PcovPt = matMul(matMul(P, covAnn), transpose(P));
  const Omega: number[][] = Array.from({ length: validViews.length }, (_, i) =>
    Array.from({ length: validViews.length }, (_, j) => {
      if (i !== j) return 0;
      const conf = Math.max(0.01, Math.min(0.99, validViews[i].confidence));
      return ((1 - conf) / conf) * tau * PcovPt[i][i];
    })
  );

  // BL posterior: μ_BL = [(τΣ)⁻¹ + P'Ω⁻¹P]⁻¹ · [(τΣ)⁻¹π + P'Ω⁻¹Q]
  const tauSigmaInv = matInverse(matScale(covAnn, tau));
  const OmegaInv = matInverse(Omega);
  if (!tauSigmaInv || !OmegaInv) return markowitz();

  const Pt = transpose(P);
  const A = matAdd(tauSigmaInv, matMul(matMul(Pt, OmegaInv), P));
  const AInv = matInverse(A);
  if (!AInv) return markowitz();

  const piMat: number[][] = pi.map((v) => [v]);
  const b = matAdd(
    matMul(tauSigmaInv, piMat),
    matMul(matMul(Pt, OmegaInv), Q)
  );
  const muBL = matMul(AInv, b).map((row) => row[0]); // annualized BL posterior means

  // Optimize with BL posterior means (convert to daily)
  const muBLDaily = muBL.map((v) => v / 252);
  const optimalWeights = minimizeVariance(muBLDaily, covShrunk, null);
  const currentWeights = w_m;

  const annFactor = 252;
  const sqrt252 = Math.sqrt(annFactor);
  const annRet = (w: number[]) => portfolioReturn(w, muBLDaily) * annFactor;
  const annVol = (w: number[]) => Math.sqrt(portfolioVariance(w, covShrunk)) * sqrt252;
  const sharpe = (ret: number, vol: number) =>
    vol > 0 ? (ret - riskFreeRate * annFactor) / vol : 0;

  const cRet = annRet(currentWeights);
  const oRet = annRet(optimalWeights);
  const cVol = annVol(currentWeights);
  const oVol = annVol(optimalWeights);

  return {
    tickers,
    currentWeights,
    optimalWeights,
    currentReturn: cRet,
    optimalReturn: oRet,
    currentVol: cVol,
    optimalVol: oVol,
    currentSharpe: sharpe(cRet, cVol),
    optimalSharpe: sharpe(oRet, oVol),
    blPosteriorMeans: Object.fromEntries(tickers.map((t, i) => [t, muBL[i]])),
    views: validViews,
  };
}

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
