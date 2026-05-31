import { describe, it, expect } from "vitest";
import {
  dailyReturns,
  pearson,
  runPortfolioOptimization,
  runBlackLitterman,
  runMonteCarlo,
  detectHarvestOpportunities,
} from "../portfolioMath";

// ── Test data helpers ─────────────────────────────────────────────────────────

/**
 * Creates a newest-first price series with a trend and deterministic oscillation.
 * Using sin gives nonzero variance (needed for covariance matrix and BL inner matrix).
 * amplitude=0.02 gives ~2% daily swings around the trend.
 */
function noisySeries(length: number, dailyTrend: number, amplitude = 0.02, phase = 0): number[] {
  // Build oldest-first, then reverse so closes[0] = newest (production format)
  const prices: number[] = [100];
  for (let i = 1; i < length; i++) {
    const noise = amplitude * Math.sin(i * 1.7 + phase);
    prices.push(prices[i - 1] * (1 + dailyTrend + noise));
  }
  return prices.reverse(); // newest-first
}

// ── dailyReturns ─────────────────────────────────────────────────────────────

describe("dailyReturns", () => {
  it("returns empty array for series shorter than 2", () => {
    expect(dailyReturns([])).toEqual([]);
    expect(dailyReturns([100])).toEqual([]);
  });

  it("positive return for price rise (newest-first input)", () => {
    // [110, 100] newest-first means price went from 100 to 110 → +10%
    const r = dailyReturns([110, 100]);
    expect(r).toHaveLength(1);
    expect(r[0]).toBeCloseTo(0.1, 10);
  });

  it("negative return for price drop (newest-first input)", () => {
    // [90, 100] newest-first means price went from 100 to 90 → -10%
    const r = dailyReturns([90, 100]);
    expect(r).toHaveLength(1);
    expect(r[0]).toBeCloseTo(-0.1, 10);
  });

  it("produces N-1 returns for N prices", () => {
    expect(dailyReturns(noisySeries(30, 0.001))).toHaveLength(29);
  });

  it("positive mean return for consistently rising series", () => {
    // Trend = +0.001/day, small noise — mean should be positive
    const returns = dailyReturns(noisySeries(60, 0.001, 0.0001));
    const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
    expect(mean).toBeGreaterThan(0);
  });
});

// ── pearson ───────────────────────────────────────────────────────────────────

describe("pearson", () => {
  it("returns 1 for identical series", () => {
    const a = [1, 2, 3, 4, 5];
    expect(pearson(a, a)).toBeCloseTo(1, 10);
  });

  it("returns -1 for perfectly inverse series", () => {
    const a = [1, 2, 3, 4, 5];
    const b = [5, 4, 3, 2, 1];
    expect(pearson(a, b)).toBeCloseTo(-1, 10);
  });

  it("returns 0 for constant series", () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBe(0);
  });

  it("handles series of different lengths by trimming to min", () => {
    const a = [1, 2, 3, 4, 5];
    const b = [1, 2, 3];
    expect(pearson(a, b)).toBeCloseTo(pearson(a.slice(0, 3), b), 10);
  });
});

// ── runPortfolioOptimization ──────────────────────────────────────────────────

describe("runPortfolioOptimization", () => {
  // Use noisy data so covariance matrix is well-conditioned
  const histData = {
    AAPL: noisySeries(60, 0.001, 0.02, 0),
    MSFT: noisySeries(60, 0.0008, 0.015, 1.5),
  };
  const currentValues = { AAPL: 10000, MSFT: 8000 };

  it("optimal weights sum to 1", () => {
    const result = runPortfolioOptimization(histData, currentValues);
    const sum = result.optimalWeights.reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("optimal weights are non-negative", () => {
    const result = runPortfolioOptimization(histData, currentValues);
    result.optimalWeights.forEach((w) => expect(w).toBeGreaterThanOrEqual(-1e-10));
  });

  it("tickers array matches historicalData keys", () => {
    const result = runPortfolioOptimization(histData, currentValues);
    expect(result.tickers).toEqual(expect.arrayContaining(["AAPL", "MSFT"]));
    expect(result.tickers).toHaveLength(2);
  });

  it("optimal Sharpe is a finite number", () => {
    const result = runPortfolioOptimization(histData, currentValues);
    expect(isFinite(result.optimalSharpe)).toBe(true);
  });

  it("current weights reflect input market values", () => {
    const result = runPortfolioOptimization(histData, currentValues);
    const aaplIdx = result.tickers.indexOf("AAPL");
    const msftIdx = result.tickers.indexOf("MSFT");
    expect(result.currentWeights[aaplIdx]).toBeCloseTo(10000 / 18000, 5);
    expect(result.currentWeights[msftIdx]).toBeCloseTo(8000 / 18000, 5);
  });
});

// ── runBlackLitterman ─────────────────────────────────────────────────────────

describe("runBlackLitterman", () => {
  // Noisy data ensures sufficient variance for nonsingular inner matrix
  const histData = {
    AAPL: noisySeries(60, 0.001, 0.02, 0),
    MSFT: noisySeries(60, 0.0005, 0.018, 2.0),
  };
  const currentValues = { AAPL: 10000, MSFT: 10000 }; // equal weights → symmetric prior

  describe("no views (empty array)", () => {
    it("falls back to Markowitz and weights sum to 1", () => {
      const result = runBlackLitterman(histData, currentValues, []);
      const sum = result.optimalWeights.reduce((s, w) => s + w, 0);
      expect(sum).toBeCloseTo(1, 5);
    });

    it("returns empty validViews in result", () => {
      const result = runBlackLitterman(histData, currentValues, []);
      expect(result.views).toHaveLength(0);
    });

    it("blPosteriorMeans keys match tickers", () => {
      const result = runBlackLitterman(histData, currentValues, []);
      expect(Object.keys(result.blPosteriorMeans)).toEqual(
        expect.arrayContaining(["AAPL", "MSFT"])
      );
    });
  });

  describe("absolute views", () => {
    it("strong bullish view on AAPL raises its BL posterior mean above the prior", () => {
      const baseline = runBlackLitterman(histData, currentValues, []);
      const withView = runBlackLitterman(histData, currentValues, [
        { ticker: "AAPL", expectedAnnualReturn: 0.30, confidence: 0.9 },
      ]);
      expect(withView.blPosteriorMeans["AAPL"]).toBeGreaterThan(
        baseline.blPosteriorMeans["AAPL"]
      );
    });

    it("strong bearish view on MSFT lowers its BL posterior mean", () => {
      const baseline = runBlackLitterman(histData, currentValues, []);
      const withView = runBlackLitterman(histData, currentValues, [
        { ticker: "MSFT", expectedAnnualReturn: -0.15, confidence: 0.9 },
      ]);
      expect(withView.blPosteriorMeans["MSFT"]).toBeLessThan(
        baseline.blPosteriorMeans["MSFT"]
      );
    });

    it("higher confidence view has stronger posterior impact than lower confidence", () => {
      const highConf = runBlackLitterman(histData, currentValues, [
        { ticker: "AAPL", expectedAnnualReturn: 0.30, confidence: 0.95 },
      ]);
      const lowConf = runBlackLitterman(histData, currentValues, [
        { ticker: "AAPL", expectedAnnualReturn: 0.30, confidence: 0.1 },
      ]);
      expect(highConf.blPosteriorMeans["AAPL"]).toBeGreaterThan(
        lowConf.blPosteriorMeans["AAPL"]
      );
    });

    it("optimal weights sum to 1 with view", () => {
      const result = runBlackLitterman(histData, currentValues, [
        { ticker: "AAPL", expectedAnnualReturn: 0.20, confidence: 0.75 },
      ]);
      const sum = result.optimalWeights.reduce((s, w) => s + w, 0);
      expect(sum).toBeCloseTo(1, 5);
    });

    it("optimal weights are non-negative", () => {
      const result = runBlackLitterman(histData, currentValues, [
        { ticker: "AAPL", expectedAnnualReturn: 0.15, confidence: 0.6 },
      ]);
      result.optimalWeights.forEach((w) => expect(w).toBeGreaterThanOrEqual(-1e-10));
    });

    it("view is included in result.views", () => {
      const view = { ticker: "AAPL", expectedAnnualReturn: 0.20, confidence: 0.75 };
      const result = runBlackLitterman(histData, currentValues, [view]);
      expect(result.views).toHaveLength(1);
      expect(result.views[0].ticker).toBe("AAPL");
    });
  });

  describe("relative views (vsTicker)", () => {
    it("high-confidence relative view makes posterior spread close to the view spread", () => {
      // BL property: posteriorSpread = priorEquilibrium + c*(viewSpread - priorEquilibrium)
      // At c→1, posteriorSpread → viewSpread.
      // We test with c=0.99: spread must be within ±0.05 of viewSpread (0.08).
      const viewSpread = 0.08;
      const result = runBlackLitterman(histData, currentValues, [
        { ticker: "AAPL", vsTicker: "MSFT", expectedAnnualReturn: viewSpread, confidence: 0.99 },
      ]);
      const posteriorSpread =
        result.blPosteriorMeans["AAPL"] - result.blPosteriorMeans["MSFT"];
      expect(Math.abs(posteriorSpread - viewSpread)).toBeLessThan(0.05);
    });

    it("filters out relative view where vsTicker is not in portfolio", () => {
      const result = runBlackLitterman(histData, currentValues, [
        { ticker: "AAPL", vsTicker: "GOOGL_NOT_IN_PORTFOLIO", expectedAnnualReturn: 0.05, confidence: 0.8 },
      ]);
      // vsTicker unknown → filtered → validViews empty → Markowitz fallback
      expect(result.views).toHaveLength(0);
      const sum = result.optimalWeights.reduce((s, w) => s + w, 0);
      expect(sum).toBeCloseTo(1, 5);
    });
  });

  describe("numerical stability", () => {
    it("handles 3-asset portfolio without NaN", () => {
      const data = {
        A: noisySeries(60, 0.001, 0.02, 0),
        B: noisySeries(60, 0.0007, 0.025, 1.0),
        C: noisySeries(60, 0.0005, 0.018, 2.5),
      };
      const values = { A: 5000, B: 5000, C: 5000 };
      const result = runBlackLitterman(data, values, [
        { ticker: "A", expectedAnnualReturn: 0.18, confidence: 0.7 },
        { ticker: "B", vsTicker: "C", expectedAnnualReturn: 0.05, confidence: 0.6 },
      ]);
      result.optimalWeights.forEach((w) => {
        expect(isNaN(w)).toBe(false);
        expect(isFinite(w)).toBe(true);
      });
      const sum = result.optimalWeights.reduce((s, w) => s + w, 0);
      expect(sum).toBeCloseTo(1, 5);
    });

    it("falls back to Markowitz when all views reference unknown tickers", () => {
      const markowitz = runPortfolioOptimization(histData, currentValues);
      const blResult = runBlackLitterman(histData, currentValues, [
        { ticker: "GOOGL", expectedAnnualReturn: 0.20, confidence: 0.8 },
      ]);
      // Same optimal weights since BL falls back
      blResult.optimalWeights.forEach((w, i) => {
        expect(w).toBeCloseTo(markowitz.optimalWeights[i], 5);
      });
    });
  });
});

// ── runMonteCarlo ─────────────────────────────────────────────────────────────

describe("runMonteCarlo", () => {
  it("p50 path length equals horizonDays + 1 (includes day 0)", () => {
    const result = runMonteCarlo(0.0005, 0.02, 10000, 252);
    expect(result.p50).toHaveLength(253);
  });

  it("all percentile paths start at S0", () => {
    const result = runMonteCarlo(0.0005, 0.02, 10000, 252, 0, 500);
    [result.p10, result.p25, result.p50, result.p75, result.p90].forEach((path) => {
      expect(path[0]).toBeCloseTo(10000, 0);
    });
  });

  it("percentile ordering is preserved: p10 < p25 < p50 < p75 < p90", () => {
    const result = runMonteCarlo(0.0005, 0.02, 10000, 252, 0, 500);
    const last = result.days;
    expect(result.p10[last]).toBeLessThan(result.p25[last]);
    expect(result.p25[last]).toBeLessThan(result.p50[last]);
    expect(result.p50[last]).toBeLessThan(result.p75[last]);
    expect(result.p75[last]).toBeLessThan(result.p90[last]);
  });

  it("positive drift produces median final value above initial", () => {
    const result = runMonteCarlo(0.001, 0.01, 10000, 252, 0, 1000);
    expect(result.p50[result.days]).toBeGreaterThan(10000);
  });
});

// ── detectHarvestOpportunities ────────────────────────────────────────────────

describe("detectHarvestOpportunities", () => {
  it("detects loss above $100 threshold", () => {
    const alerts = detectHarvestOpportunities([
      { ticker: "AAPL", purchasePrice: 200, currentPrice: 150, quantity: 10 }, // -$500
    ]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].latentLoss).toBe(-500);
  });

  it("ignores loss below $100 threshold", () => {
    const alerts = detectHarvestOpportunities([
      { ticker: "AAPL", purchasePrice: 100, currentPrice: 99, quantity: 1 }, // -$1
    ]);
    expect(alerts).toHaveLength(0);
  });

  it("ignores positions without purchasePrice or quantity", () => {
    const alerts = detectHarvestOpportunities([
      { ticker: "AAPL", purchasePrice: null, currentPrice: 100, quantity: 10 },
      { ticker: "MSFT", purchasePrice: 200, currentPrice: 100, quantity: null },
    ]);
    expect(alerts).toHaveLength(0);
  });

  it("sorts alerts worst loss first", () => {
    const alerts = detectHarvestOpportunities([
      { ticker: "AAPL", purchasePrice: 200, currentPrice: 100, quantity: 10 }, // -$1000
      { ticker: "MSFT", purchasePrice: 300, currentPrice: 100, quantity: 10 }, // -$2000
    ]);
    expect(alerts[0].ticker).toBe("MSFT");
    expect(alerts[1].ticker).toBe("AAPL");
  });

  it("includes known ETF alternative for standard tickers", () => {
    const alerts = detectHarvestOpportunities([
      { ticker: "AAPL", purchasePrice: 200, currentPrice: 100, quantity: 10 },
    ]);
    expect(alerts[0].alternative).toBe("QQQ");
  });

  it("reports no alternative for unknown tickers", () => {
    const alerts = detectHarvestOpportunities([
      { ticker: "XYZ_UNKNOWN", purchasePrice: 200, currentPrice: 100, quantity: 10 },
    ]);
    expect(alerts[0].alternative).toBeUndefined();
  });
});
