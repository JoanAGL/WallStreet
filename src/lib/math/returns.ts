/**
 * Computes chronological daily returns (oldest→newest) from a closes array
 * that is ordered newest-first (closes[0] = most recent), as returned by
 * Yahoo Finance / Finnhub. Reversing before the loop corrects the sign so
 * that rising assets produce positive returns and Sharpe ratios.
 */
export function dailyReturns(closes: number[]): number[] {
  const ret: number[] = [];
  // Reverse: ordered[0] = oldest, ordered[n-1] = newest
  const ordered = closes.slice().reverse();
  for (let i = 1; i < ordered.length; i++) {
    ret.push((ordered[i] - ordered[i - 1]) / ordered[i - 1]);
  }
  return ret;
}
