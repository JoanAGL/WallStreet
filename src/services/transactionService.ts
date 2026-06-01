import {
  createTransaction,
  getTransactionsByStock,
  getTransactionsByUser,
  findTransactionByIdAndUser,
  deleteTransaction,
  type TransactionRecord,
  type TransactionType,
} from "@/repositories/transactionRepository";
import { findStockByIdAndUser } from "@/repositories/stockRepository";

// ── Types ─────────────────────────────────────────────────────────────────────

export type { TransactionRecord, TransactionType };

export interface PositionMetrics {
  stockId:             string;
  ticker:              string;
  openShares:          number;
  avgBuyPrice:         number | null;   // WAC of remaining open position
  avgSellPrice:        number | null;   // weighted average of all sells
  totalBuyAmount:      number;          // Σ (buyShares × buyPrice)
  totalSellAmount:     number;          // Σ (sellShares × sellPrice)
  openCostBasis:       number;          // avgBuyPrice × openShares
  currentValue:        number | null;   // openShares × currentPrice
  unrealizedPnL:       number | null;   // currentValue − openCostBasis
  unrealizedPnLPct:    number | null;   // (unrealizedPnL / openCostBasis) × 100
  realizedPnL:         number;          // Σ (sellPrice − avgCostAtSale) × shares
  realizedPnLPct:      number | null;   // realizedPnL / soldCostBasis × 100
  breakEvenPrice:      number | null;   // = avgBuyPrice
  daysHeld:            number | null;   // from first transaction date to today
  annualizedReturn:    number | null;   // CAGR % — null when daysHeld ≤ 0
  portfolioWeightPct:  number | null;   // set at portfolio level
  transactions:        TransactionRecord[];
}

export interface PortfolioSummary {
  positions:           PositionMetrics[];
  totalCurrentValue:   number;
  totalCostBasis:      number;
  totalUnrealizedPnL:  number | null;
  totalUnrealizedPnLPct: number | null;
  totalRealizedPnL:    number;
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Core WAC computation ──────────────────────────────────────────────────────

/**
 * Computes all position metrics for one stock using Weighted Average Cost (WAC).
 * Transactions must be provided in chronological order (oldest first).
 */
export function calculatePositionMetrics(
  transactions: TransactionRecord[],
  stockId: string,
  ticker: string,
  currentPrice: number | null
): PositionMetrics {
  // Sort oldest-first: prefer explicit date, fall back to createdAt
  const sorted = [...transactions].sort((a, b) => {
    const da = (a.date ?? a.createdAt).getTime();
    const db = (b.date ?? b.createdAt).getTime();
    return da - db || a.createdAt.getTime() - b.createdAt.getTime();
  });

  let avgCost        = 0;
  let openShares     = 0;
  let realizedPnL    = 0;
  let soldCostBasis  = 0;   // cost basis of shares that were sold
  let totalBuyAmt    = 0;
  let totalSellAmt   = 0;
  let totalSoldShrs  = 0;
  let sellWeightedP  = 0;   // Σ (sellShares × sellPrice) for avg sell price
  let firstDate: Date | null = null;

  for (const tx of sorted) {
    const txDate = tx.date ?? tx.createdAt;
    if (!firstDate || txDate < firstDate) firstDate = txDate;

    if (tx.type === "BUY") {
      const totalCost  = avgCost * openShares + tx.price * tx.shares;
      openShares       = r2(openShares + tx.shares);
      avgCost          = openShares > 0 ? totalCost / openShares : 0;
      totalBuyAmt      = r2(totalBuyAmt + tx.price * tx.shares);
    } else {
      const sellableShares = Math.min(tx.shares, openShares);
      const profit     = sellableShares * (tx.price - avgCost);
      realizedPnL      = r2(realizedPnL + profit);
      soldCostBasis    = r2(soldCostBasis + sellableShares * avgCost);
      openShares       = r2(Math.max(0, openShares - sellableShares));
      totalSellAmt     = r2(totalSellAmt + tx.price * sellableShares);
      totalSoldShrs    = r2(totalSoldShrs + sellableShares);
      sellWeightedP   += tx.price * sellableShares;
    }
  }

  const avgBuyPrice     = openShares > 1e-9 ? r2(avgCost)  : null;
  const avgSellPrice    = totalSoldShrs > 0 ? r2(sellWeightedP / totalSoldShrs) : null;
  const openCostBasis   = r2(avgCost * openShares);
  const currentValue    = currentPrice != null && openShares > 1e-9
    ? r2(currentPrice * openShares) : null;
  const unrealizedPnL   = currentValue != null ? r2(currentValue - openCostBasis) : null;
  const unrealizedPnLPct = unrealizedPnL != null && openCostBasis > 0
    ? r2((unrealizedPnL / openCostBasis) * 100) : null;
  const realizedPnLPct  = soldCostBasis > 0
    ? r2((realizedPnL / soldCostBasis) * 100) : null;

  // Days held from first transaction to today
  const daysHeld = firstDate
    ? Math.max(0, Math.floor((Date.now() - firstDate.getTime()) / 86_400_000))
    : null;

  // CAGR: ((currentValue + realizedPnL) / totalBuyAmt)^(365/days) − 1
  let annualizedReturn: number | null = null;
  if (daysHeld != null && daysHeld > 0 && totalBuyAmt > 0) {
    const totalFinal = (currentValue ?? openCostBasis) + realizedPnL;
    const ratio      = totalFinal / totalBuyAmt;
    if (ratio > 0) {
      annualizedReturn = r2((Math.pow(ratio, 365 / daysHeld) - 1) * 100);
    }
  }

  return {
    stockId,
    ticker,
    openShares:         r2(openShares),
    avgBuyPrice,
    avgSellPrice,
    totalBuyAmount:     totalBuyAmt,
    totalSellAmount:    totalSellAmt,
    openCostBasis,
    currentValue,
    unrealizedPnL,
    unrealizedPnLPct,
    realizedPnL,
    realizedPnLPct,
    breakEvenPrice:     avgBuyPrice,
    daysHeld,
    annualizedReturn,
    portfolioWeightPct: null,
    transactions,
  };
}

// ── Service functions ─────────────────────────────────────────────────────────

export async function addTransaction(
  userId:  string,
  stockId: string,
  type:    TransactionType,
  shares:  number,
  price:   number,
  date?:   Date | null,
  notes?:  string | null
): Promise<TransactionRecord> {
  if (shares <= 0 || !isFinite(shares)) throw new Error("Las acciones deben ser un número positivo.");
  if (price  <= 0 || !isFinite(price))  throw new Error("El precio debe ser un número positivo.");

  const stock = await findStockByIdAndUser(stockId, userId);
  if (!stock) throw new Error("Acción no encontrada o no pertenece al usuario.");

  if (type === "SELL") {
    const txs        = await getTransactionsByStock(stockId);
    const metrics    = calculatePositionMetrics(txs, stockId, stock.ticker, null);
    if (shares > metrics.openShares + 1e-9) {
      throw new Error(
        `Acciones insuficientes. Tienes ${metrics.openShares} disponibles y quieres vender ${shares}.`
      );
    }
  }

  return createTransaction({ stockId, type, shares, price, date: date ?? null, notes: notes ?? null });
}

export async function deleteUserTransaction(
  userId:        string,
  transactionId: string
): Promise<void> {
  const tx = await findTransactionByIdAndUser(transactionId, userId);
  if (!tx) throw new Error("Transacción no encontrada o no pertenece al usuario.");
  await deleteTransaction(transactionId);
}

export async function getStockMetrics(
  userId:       string,
  stockId:      string,
  currentPrice: number | null
): Promise<PositionMetrics> {
  const stock = await findStockByIdAndUser(stockId, userId);
  if (!stock) throw new Error("Acción no encontrada o no pertenece al usuario.");
  const txs = await getTransactionsByStock(stockId);
  return calculatePositionMetrics(txs, stockId, stock.ticker, currentPrice);
}

export async function getPortfolioMetrics(
  userId:        string,
  currentPrices: Record<string, number>   // stockId → currentPrice
): Promise<PortfolioSummary> {
  const txs      = await getTransactionsByUser(userId);
  const byStock  = new Map<string, TransactionRecord[]>();

  for (const tx of txs) {
    if (!byStock.has(tx.stockId)) byStock.set(tx.stockId, []);
    byStock.get(tx.stockId)!.push(tx);
  }

  // We need ticker per stockId — read from transactions (ticker stored in stock relation)
  // Since transactionRepository doesn't join stock, fetch stocks separately
  const { prisma } = await import("@/lib/prisma");
  const stocks = await prisma.stock.findMany({
    where: { userId },
    select: { id: true, ticker: true },
  });
  const tickerMap = new Map(stocks.map((s) => [s.id, s.ticker]));

  const positions: PositionMetrics[] = [];
  for (const [stockId, stockTxs] of Array.from(byStock.entries())) {
    const ticker  = tickerMap.get(stockId) ?? stockId;
    const price   = currentPrices[stockId] ?? null;
    positions.push(calculatePositionMetrics(stockTxs, stockId, ticker, price));
  }

  // Compute portfolio weight
  const totalCurrentValue = positions.reduce((s, p) => s + (p.currentValue ?? 0), 0);
  for (const p of positions) {
    p.portfolioWeightPct = totalCurrentValue > 0 && p.currentValue != null
      ? r2((p.currentValue / totalCurrentValue) * 100)
      : null;
  }

  const totalCostBasis      = r2(positions.reduce((s, p) => s + p.openCostBasis, 0));
  const totalUnrealizedPnL  = r2(positions.reduce((s, p) => s + (p.unrealizedPnL ?? 0), 0));
  const totalRealizedPnL    = r2(positions.reduce((s, p) => s + p.realizedPnL, 0));
  const totalUnrealizedPct  = totalCostBasis > 0
    ? r2((totalUnrealizedPnL / totalCostBasis) * 100) : null;

  return {
    positions,
    totalCurrentValue:      r2(totalCurrentValue),
    totalCostBasis,
    totalUnrealizedPnL,
    totalUnrealizedPnLPct:  totalUnrealizedPct,
    totalRealizedPnL,
  };
}
