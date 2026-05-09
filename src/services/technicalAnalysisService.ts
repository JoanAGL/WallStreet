/**
 * Calcula la Media Móvil Simple para los últimos `period` precios.
 * @param closes - Precios de cierre, del más reciente al más antiguo
 */
export function calculateSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(0, period);
  return slice.reduce((sum, val) => sum + val, 0) / period;
}

/**
 * Calcula el RSI de Wilder para `period` períodos.
 * @param closes - Precios de cierre, del más reciente al más antiguo
 */
export function calculateRSI(closes: number[], period = 14): number | null {
  // Necesitamos al menos period+1 puntos para calcular period movimientos
  if (closes.length < period + 1) return null;

  // Los cierres vienen más reciente primero; los invertimos para iterar cronológicamente
  const ordered = closes.slice(0, period + 1).reverse();

  let totalGain = 0;
  let totalLoss = 0;

  for (let i = 1; i <= period; i++) {
    const diff = ordered[i] - ordered[i - 1];
    if (diff > 0) {
      totalGain += diff;
    } else {
      totalLoss += Math.abs(diff);
    }
  }

  const avgGain = totalGain / period;
  const avgLoss = totalLoss / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

export interface TechnicalIndicators {
  ticker: string;
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
  calculatedAt: string;
}

export function calculateIndicators(
  ticker: string,
  closes: number[]
): TechnicalIndicators {
  return {
    ticker,
    sma20: calculateSMA(closes, 20),
    sma50: calculateSMA(closes, 50),
    rsi14: calculateRSI(closes, 14),
    calculatedAt: new Date().toISOString(),
  };
}
