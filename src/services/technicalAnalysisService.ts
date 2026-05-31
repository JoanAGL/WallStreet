export function calculateSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(0, period);
  return slice.reduce((sum, val) => sum + val, 0) / period;
}

export function calculateRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  const ordered = closes.slice(0, period + 1).reverse();

  let totalGain = 0;
  let totalLoss = 0;

  for (let i = 1; i <= period; i++) {
    const diff = ordered[i] - ordered[i - 1];
    if (diff > 0) totalGain += diff;
    else totalLoss += Math.abs(diff);
  }

  const avgGain = totalGain / period;
  const avgLoss = totalLoss / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

/**
 * Average True Range (14 períodos).
 * closes, highs, lows deben estar ordenados del más reciente al más antiguo.
 */
export function calculateATR(
  closes: number[],
  highs: number[],
  lows: number[],
  period = 14
): number | null {
  if (closes.length < period + 1) return null;

  // Ordenamos cronológicamente para calcular TR con la vela anterior
  const len = period + 1;
  const c = closes.slice(0, len).reverse();
  const h = highs.slice(0, len).reverse();
  const l = lows.slice(0, len).reverse();

  const trValues: number[] = [];
  for (let i = 1; i < len; i++) {
    const tr = Math.max(
      h[i] - l[i],
      Math.abs(h[i] - c[i - 1]),
      Math.abs(l[i] - c[i - 1])
    );
    trValues.push(tr);
  }

  const atr = trValues.reduce((s, v) => s + v, 0) / trValues.length;
  return parseFloat(atr.toFixed(4));
}

/**
 * Volumen relativo: volumen del día más reciente / media de volumen de N días.
 * volumes[0] = día más reciente.
 */
export function calculateRelativeVolume(
  volumes: number[],
  period = 20
): number | null {
  if (volumes.length < period + 1) return null;

  const current = volumes[0];
  const avgVol = volumes.slice(1, period + 1).reduce((s, v) => s + v, 0) / period;

  if (avgVol === 0) return null;
  return parseFloat((current / avgVol).toFixed(2));
}

// ── Hurst Exponent ────────────────────────────────────────────────────────────
// R/S (rescaled range) analysis over multiple sub-period sizes.
// H > 0.55 → trending (persistent), H < 0.45 → mean-reverting, H ≈ 0.5 → random walk.
// Minimum 30 data points required; returns null if insufficient data.
export function calculateHurstExponent(closes: number[]): number | null {
  if (closes.length < 30) return null;

  // Work chronologically (oldest first)
  const series = closes.slice().reverse();
  const N = series.length;

  // Log-returns
  const returns: number[] = [];
  for (let i = 1; i < N; i++) {
    returns.push(Math.log(series[i] / series[i - 1]));
  }

  const lagSizes = [8, 16, 32, 64].filter((l) => l < returns.length);
  if (lagSizes.length < 2) return null;

  const rsValues: number[] = [];
  const logLags: number[] = [];

  for (const lag of lagSizes) {
    const chunks = Math.floor(returns.length / lag);
    if (chunks === 0) continue;

    let rsSum = 0;
    for (let c = 0; c < chunks; c++) {
      const sub = returns.slice(c * lag, c * lag + lag);
      const mean = sub.reduce((s, v) => s + v, 0) / sub.length;

      // Cumulative deviation from mean
      let cumDev = 0;
      let maxCum = -Infinity;
      let minCum = Infinity;
      for (const v of sub) {
        cumDev += v - mean;
        if (cumDev > maxCum) maxCum = cumDev;
        if (cumDev < minCum) minCum = cumDev;
      }
      const range = maxCum - minCum;

      // Standard deviation
      const variance = sub.reduce((s, v) => s + (v - mean) ** 2, 0) / sub.length;
      const std = Math.sqrt(variance);

      if (std > 0) rsSum += range / std;
    }

    const avgRS = rsSum / chunks;
    if (avgRS > 0) {
      rsValues.push(Math.log(avgRS));
      logLags.push(Math.log(lag));
    }
  }

  if (rsValues.length < 2) return null;

  // OLS slope of log(R/S) ~ H * log(lag)
  const n = rsValues.length;
  const meanX = logLags.reduce((s, v) => s + v, 0) / n;
  const meanY = rsValues.reduce((s, v) => s + v, 0) / n;
  const num = logLags.reduce((s, x, i) => s + (x - meanX) * (rsValues[i] - meanY), 0);
  const den = logLags.reduce((s, x) => s + (x - meanX) ** 2, 0);

  return den === 0 ? null : parseFloat((num / den).toFixed(3));
}

// ── Volume-Price Divergence Z-score ──────────────────────────────────────────
// Feature = relVolume * priceChange. Z-score over a 20-period rolling window.
// |Z| > 2.5 → anomaly (unusual volume-driven price move).
// Returns null if fewer than 21 price+volume points available.
export function calculateVolumePriceDivergence(
  closes: number[],
  volumes: number[],
  period = 20
): number | null {
  if (closes.length < period + 1 || volumes.length < period + 1) return null;

  const avgVol = volumes.slice(1, period + 1).reduce((s, v) => s + v, 0) / period;
  if (avgVol === 0) return null;

  const features: number[] = [];
  for (let i = 0; i < period; i++) {
    const relVol = volumes[i] / avgVol;
    const pctChange = i + 1 < closes.length ? (closes[i] - closes[i + 1]) / closes[i + 1] : 0;
    features.push(relVol * pctChange);
  }

  const mean = features.reduce((s, v) => s + v, 0) / features.length;
  const std = Math.sqrt(features.reduce((s, v) => s + (v - mean) ** 2, 0) / features.length);

  if (std === 0) return 0;
  return parseFloat(((features[0] - mean) / std).toFixed(3));
}

export type MarketRegime = "TRENDING" | "MEAN_REVERTING" | "RANDOM_WALK" | "UNKNOWN";

function hurstToRegime(hurst: number | null): MarketRegime {
  if (hurst === null) return "UNKNOWN";
  if (hurst > 0.55) return "TRENDING";
  if (hurst < 0.45) return "MEAN_REVERTING";
  return "RANDOM_WALK";
}

export interface TechnicalIndicators {
  ticker: string;
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
  atr14: number | null;
  relVolume: number | null;
  /** Hurst exponent (R/S analysis). H>0.55=trending, H<0.45=mean-reverting. */
  hurstExponent: number | null;
  /** Current market regime derived from Hurst exponent. */
  marketRegime: MarketRegime;
  /** Volume-Price divergence Z-score. |Z|>2.5 signals an anomaly. */
  volumePriceDivergenceZ: number | null;
  calculatedAt: string;
}

export function calculateIndicators(
  ticker: string,
  closes: number[],
  highs: number[] = [],
  lows: number[] = [],
  volumes: number[] = []
): TechnicalIndicators {
  const hurstExponent = calculateHurstExponent(closes);
  return {
    ticker,
    sma20:     calculateSMA(closes, 20),
    sma50:     calculateSMA(closes, 50),
    rsi14:     calculateRSI(closes, 14),
    atr14:     highs.length >= 15 ? calculateATR(closes, highs, lows, 14) : null,
    relVolume: volumes.length >= 21 ? calculateRelativeVolume(volumes, 20) : null,
    hurstExponent,
    marketRegime: hurstToRegime(hurstExponent),
    volumePriceDivergenceZ:
      closes.length >= 21 && volumes.length >= 21
        ? calculateVolumePriceDivergence(closes, volumes)
        : null,
    calculatedAt: new Date().toISOString(),
  };
}
