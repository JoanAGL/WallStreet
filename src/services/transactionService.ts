import {
  createTransaction,
  updateTransaction,
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
  breakEvenPrice:      number | null;   // price where total P&L = 0: (openCostBasis − realizedPnL) / openShares
  daysHeld:            number | null;   // first transaction → today (open) or last transaction (closed)
  annualizedReturn:    number | null;   // CAGR % — null when daysHeld < MIN_DAYS_FOR_CAGR
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

// Below this holding period the CAGR extrapolation is meaningless
// (e.g. −16% in 8 days annualizes to −99.97%), so it is suppressed.
const MIN_DAYS_FOR_CAGR = 30;

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
  let lastDate:  Date | null = null;

  for (const tx of sorted) {
    const txDate = tx.date ?? tx.createdAt;

    if (tx.type === "SPLIT") {
      // shares = factor (10 → 10:1, 0.1 → contrasplit 1:10). Multiplica las
      // acciones abiertas y divide el coste medio: el capital no cambia.
      // No toca firstDate/lastDate: un split no es una operación de cartera.
      if (tx.shares > 0 && openShares > 1e-9) {
        openShares = r2(openShares * tx.shares);
        avgCost    = avgCost / tx.shares;
      }
      continue;
    }

    if (!firstDate || txDate < firstDate) firstDate = txDate;
    if (!lastDate  || txDate > lastDate)  lastDate  = txDate;

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

  // Days held: first transaction → today while open, → last transaction once closed
  const isClosed = openShares <= 1e-9;
  const endTime  = isClosed && lastDate ? lastDate.getTime() : Date.now();
  const daysHeld = firstDate
    ? Math.max(0, Math.floor((endTime - firstDate.getTime()) / 86_400_000))
    : null;

  // CAGR over total invested capital. Final wealth must include the sale
  // proceeds (cost recovered + profit), not just the realized P&L — otherwise
  // any position with sells understates the ratio and the CAGR goes deeply
  // negative even on winning trades.
  let annualizedReturn: number | null = null;
  if (daysHeld != null && daysHeld >= MIN_DAYS_FOR_CAGR && totalBuyAmt > 0) {
    const totalFinal = (currentValue ?? openCostBasis) + totalSellAmt;
    const ratio      = totalFinal / totalBuyAmt;
    if (ratio > 0) {
      annualizedReturn = r2((Math.pow(ratio, 365 / daysHeld) - 1) * 100);
    }
  }

  // Break-even: sale price of the open shares at which total P&L is zero,
  // i.e. realized profits already cushion part of the remaining cost.
  const breakEvenPrice = openShares > 1e-9
    ? r2(Math.max(0, (avgCost * openShares - realizedPnL) / openShares))
    : null;

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
    breakEvenPrice,
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
  if (shares <= 0 || !isFinite(shares)) {
    throw new Error(
      type === "SPLIT"
        ? "El factor del split debe ser un número positivo (ej: 10 para un split 10:1)."
        : "Las acciones deben ser un número positivo."
    );
  }
  // En un SPLIT el precio no tiene significado: se almacena 1.
  if (type !== "SPLIT" && (price <= 0 || !isFinite(price)))
    throw new Error("El precio debe ser un número positivo.");

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

  return createTransaction({
    stockId,
    type,
    shares,
    price: type === "SPLIT" ? 1 : price,
    date:  date ?? null,
    notes: notes ?? null,
  });
}

export interface TransactionPatch {
  type?:   TransactionType;
  shares?: number;
  price?:  number;
  date?:   Date | null;
  notes?:  string | null;
}

export async function editUserTransaction(
  userId:        string,
  transactionId: string,
  patch:         TransactionPatch
): Promise<TransactionRecord> {
  const tx = await findTransactionByIdAndUser(transactionId, userId);
  if (!tx) throw new Error("Transacción no encontrada o no pertenece al usuario.");

  if (patch.shares !== undefined && (patch.shares <= 0 || !isFinite(patch.shares)))
    throw new Error("Las acciones deben ser un número positivo.");
  if (patch.price  !== undefined && (patch.price  <= 0 || !isFinite(patch.price)))
    throw new Error("El precio debe ser un número positivo.");

  // If changing type to SELL or updating shares on a SELL, validate available shares
  const effectiveType   = patch.type   ?? tx.type;
  const effectiveShares = patch.shares ?? tx.shares;
  if (effectiveType === "SELL") {
    const allTxs  = await getTransactionsByStock(tx.stockId);
    // Compute open shares excluding the current transaction, then check
    const others  = allTxs.filter((t) => t.id !== transactionId);
    const metrics = calculatePositionMetrics(others, tx.stockId, "", null);
    if (effectiveShares > metrics.openShares + 1e-9) {
      throw new Error(
        `Acciones insuficientes. Tienes ${metrics.openShares} disponibles (sin contar esta transacción).`
      );
    }
  }

  return updateTransaction(transactionId, patch);
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

// ── Sell history (per-sell WAC P&L) ──────────────────────────────────────────

export interface SellHistoryEntry {
  id:               string;
  source:           "transaction" | "manual";  // determines delete endpoint
  ticker:           string;
  stockId:          string | null;
  shares:           number;
  avgCostAtSale:    number;
  sellPrice:        number;
  investedAmount:   number;
  revenueAmount:    number;
  profitAmount:     number;
  profitPercentage: number;
  date:             Date;
  notes:            string | null;
}

export interface SellHistorySummary {
  entries:          SellHistoryEntry[];
  totalInvested:    number;
  totalRevenue:     number;
  totalProfit:      number;
  totalProfitPct:   number;
}

export async function getTransactionHistory(userId: string): Promise<SellHistorySummary> {
  const { prisma } = await import("@/lib/prisma");
  const { getManualSellsByUser } = await import("@/repositories/manualSellRepository");

  const stocks = await prisma.stock.findMany({
    where:  { userId },
    select: { id: true, ticker: true },
  });
  const tickerMap = new Map(stocks.map((s) => [s.id, s.ticker]));

  const txs = await getTransactionsByUser(userId);
  const byStock = new Map<string, TransactionRecord[]>();
  for (const tx of txs) {
    if (!byStock.has(tx.stockId)) byStock.set(tx.stockId, []);
    byStock.get(tx.stockId)!.push(tx);
  }

  const entries: SellHistoryEntry[] = [];

  // ── Transaction-based SELL entries (WAC computed) ─────────────────────────
  for (const [stockId, stockTxs] of Array.from(byStock.entries())) {
    const ticker = tickerMap.get(stockId) ?? stockId;
    const sorted = [...stockTxs].sort((a, b) => {
      const da = (a.date ?? a.createdAt).getTime();
      const db = (b.date ?? b.createdAt).getTime();
      return da - db || a.createdAt.getTime() - b.createdAt.getTime();
    });

    let avgCost    = 0;
    let openShares = 0;

    for (const tx of sorted) {
      if (tx.type === "SPLIT") {
        if (tx.shares > 0 && openShares > 1e-9) {
          openShares = r2(openShares * tx.shares);
          avgCost    = avgCost / tx.shares;
        }
      } else if (tx.type === "BUY") {
        const totalCost = avgCost * openShares + tx.price * tx.shares;
        openShares      = r2(openShares + tx.shares);
        avgCost         = openShares > 0 ? totalCost / openShares : 0;
      } else {
        const sellable       = Math.min(tx.shares, openShares);
        const investedAmount = r2(sellable * avgCost);
        const revenueAmount  = r2(sellable * tx.price);
        const profitAmount   = r2(revenueAmount - investedAmount);
        const profitPct      = investedAmount > 0 ? r2((profitAmount / investedAmount) * 100) : 0;

        openShares = r2(Math.max(0, openShares - sellable));

        entries.push({
          id:               tx.id,
          source:           "transaction",
          ticker,
          stockId,
          shares:           sellable,
          avgCostAtSale:    r2(avgCost),
          sellPrice:        tx.price,
          investedAmount,
          revenueAmount,
          profitAmount,
          profitPercentage: profitPct,
          date:             tx.date ?? tx.createdAt,
          notes:            tx.notes ?? null,
        });
      }
    }
  }

  // ── Manual entries (historical positions not in dashboard) ────────────────
  const manual = await getManualSellsByUser(userId);
  for (const m of manual) {
    entries.push({
      id:               m.id,
      source:           "manual",
      ticker:           m.ticker,
      stockId:          null,
      shares:           m.shares,
      avgCostAtSale:    m.avgBuyPrice,
      sellPrice:        m.sellPrice,
      investedAmount:   m.investedAmount,
      revenueAmount:    m.revenueAmount,
      profitAmount:     m.profitAmount,
      profitPercentage: m.profitPercentage,
      date:             m.date,
      notes:            m.notes ?? null,
    });
  }

  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalInvested  = r2(entries.reduce((s, e) => s + e.investedAmount, 0));
  const totalRevenue   = r2(entries.reduce((s, e) => s + e.revenueAmount,  0));
  const totalProfit    = r2(totalRevenue - totalInvested);
  const totalProfitPct = totalInvested > 0 ? r2((totalProfit / totalInvested) * 100) : 0;

  return { entries, totalInvested, totalRevenue, totalProfit, totalProfitPct };
}

// ── Portfolio metrics ─────────────────────────────────────────────────────────

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
