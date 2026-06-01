import { dailyReturns } from "../returns";
import {
  shrinkCovariance,
  minimizeVariance,
  portfolioReturn,
  portfolioVariance,
  matVec,
  runPortfolioOptimization,
} from "./markowitz";
import type { OptimizationResult } from "./markowitz";

export interface BlackLittermanView {
  ticker: string;
  /** View on expected annual return, e.g. 0.12 for +12% */
  expectedAnnualReturn: number;
  /** Analyst confidence 0–1 (1 = certainty, lower = more uncertainty) */
  confidence: number;
  /**
   * Optional: relative view. If set, the view means "ticker outperforms vsTicker
   * by expectedAnnualReturn". P row = [+1 at ticker, -1 at vsTicker].
   * If omitted: absolute view on ticker alone.
   */
  vsTicker?: string;
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

// ── Public API ────────────────────────────────────────────────────────────────

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

  // Filter views: both ticker and vsTicker must exist in the portfolio
  const validViews = views.filter(
    (v) =>
      tickerIdx[v.ticker] !== undefined &&
      (v.vsTicker === undefined || tickerIdx[v.vsTicker] !== undefined)
  );

  // Fallback to standard Markowitz; reports only the validated views
  const markowitz = (): BlackLittermanResult => {
    const base = runPortfolioOptimization(historicalData, currentValues, riskFreeRate);
    return {
      ...base,
      blPosteriorMeans: Object.fromEntries(tickers.map((t, i) => [t, mus[i] * 252])),
      views: validViews,
    };
  };

  if (validViews.length === 0) return markowitz();

  // Equilibrium prior: π = δ * Σ_ann * w_m  (N-vector, annualized)
  const covAnn = matScale(covShrunk.map((row) => [...row]), 252);
  const pi = matVec(covAnn, w_m).map((v) => v * delta);

  // P matrix (K × N):
  //   Absolute view on ticker i  → P[v][i] = +1
  //   Relative view ticker i vs j → P[v][i] = +1, P[v][j] = -1  (i outperforms j)
  const P: number[][] = validViews.map((v) => {
    const row = new Array<number>(k).fill(0);
    row[tickerIdx[v.ticker]] = 1;
    if (v.vsTicker !== undefined) {
      row[tickerIdx[v.vsTicker]] = -1;
    }
    return row;
  });

  // Q (K × 1): expected annual returns per view
  const Q: number[][] = validViews.map((v) => [v.expectedAnnualReturn]);

  // τΣ (N × N)
  const tauSigma = matScale(covAnn, tau);

  // Ω (K × K diagonal): uncertainty ∝ (1-conf)/conf · τ · P(τΣ)Pᵀ diagonal
  // Using Woodbury form avoids inverting the N×N tauSigma — only K×K needed.
  const PtauSigmaPt = matMul(matMul(P, tauSigma), transpose(P)); // K×K
  const Omega: number[][] = Array.from({ length: validViews.length }, (_, i) =>
    Array.from({ length: validViews.length }, (_, j) => {
      if (i !== j) return 0;
      const conf = Math.max(0.01, Math.min(0.99, validViews[i].confidence));
      return ((1 - conf) / conf) * PtauSigmaPt[i][i];
    })
  );

  // Woodbury identity form (He & Litterman 1999):
  //   μ_BL = π + τΣ · Pᵀ · (P · τΣ · Pᵀ + Ω)⁻¹ · (Q - P · π)
  // Only requires one K×K inverse — numerically superior to information form for N > K.
  const inner = matAdd(PtauSigmaPt, Omega);           // K×K
  const innerInv = matInverse(inner);
  if (!innerInv) return markowitz();

  const piVec: number[][] = pi.map((v) => [v]);
  const Ppi = matMul(P, piVec);                                     // K×1
  const residual = Ppi.map((row, i) => [Q[i][0] - row[0]]);        // K×1: Q - P·π
  const tauSigmaPt = matMul(tauSigma, transpose(P));                // N×K
  const correction = matMul(tauSigmaPt, matMul(innerInv, residual)); // N×1

  const muBL = pi.map((v, i) => v + correction[i][0]); // annualized BL posterior means

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
