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

export interface TechnicalIndicators {
  ticker: string;
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
  atr14: number | null;
  relVolume: number | null;
  calculatedAt: string;
}

export function calculateIndicators(
  ticker: string,
  closes: number[],
  highs: number[] = [],
  lows: number[] = [],
  volumes: number[] = []
): TechnicalIndicators {
  return {
    ticker,
    sma20:     calculateSMA(closes, 20),
    sma50:     calculateSMA(closes, 50),
    rsi14:     calculateRSI(closes, 14),
    atr14:     highs.length >= 15 ? calculateATR(closes, highs, lows, 14) : null,
    relVolume: volumes.length >= 21 ? calculateRelativeVolume(volumes, 20) : null,
    calculatedAt: new Date().toISOString(),
  };
}
