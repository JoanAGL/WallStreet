import { dailyReturns } from "./returns";

export interface CorrelationResult {
  tickers: string[];
  matrix: number[][];
  highPairs: { a: string; b: string; correlation: number }[];
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
