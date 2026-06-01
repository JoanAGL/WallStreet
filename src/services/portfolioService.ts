import {
  findStockByIdAndUser,
  updateStockQuantity,
  removeStockById,
} from "@/repositories/stockRepository";
import {
  createClosedOperation,
  getClosedOperationsByUser,
  type ClosedOperationRecord,
} from "@/repositories/closedOperationRepository";

// ── Sell result ───────────────────────────────────────────────────────────────

export interface SellResult {
  operation: ClosedOperationRecord;
  remainingShares: number;
  positionClosed: boolean;
}

// ── Portfolio performance aggregates ─────────────────────────────────────────

export interface ClosedPerformance {
  operations:        ClosedOperationRecord[];
  totalInvested:     number;   // sum of all investedAmount
  totalRevenue:      number;   // sum of all revenueAmount
  totalProfitAmount: number;   // totalRevenue - totalInvested
  totalProfitPct:    number;   // (totalProfitAmount / totalInvested) * 100, or 0 if no data
}

// ── round2 helper ─────────────────────────────────────────────────────────────
// Rounds to 2 decimal places to avoid floating-point drift in financial values.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Records a sell transaction for a partial or full position closure.
 *
 * @param userId       - Owner of the stock (for ownership verification)
 * @param stockId      - DB id of the Stock record
 * @param sharesToSell - Number of shares to sell (must be > 0 and <= current quantity)
 * @param sellPrice    - Per-share sell price in USD
 */
export async function executeSell(
  userId: string,
  stockId: string,
  sharesToSell: number,
  sellPrice: number
): Promise<SellResult> {
  if (sharesToSell <= 0) {
    throw new Error("La cantidad de acciones a vender debe ser mayor que cero.");
  }
  if (sellPrice <= 0) {
    throw new Error("El precio de venta debe ser mayor que cero.");
  }

  const stock = await findStockByIdAndUser(stockId, userId);
  if (!stock) {
    throw new Error("Acción no encontrada o no pertenece al usuario.");
  }

  const currentQty = stock.quantity ?? 0;
  if (currentQty <= 0) {
    throw new Error("No tienes acciones de esta posición para vender.");
  }
  if (sharesToSell > currentQty + 1e-9) {
    throw new Error(
      `Acciones insuficientes. Tienes ${currentQty} y quieres vender ${sharesToSell}.`
    );
  }

  const buyPrice = stock.purchasePrice;
  if (!buyPrice || buyPrice <= 0) {
    throw new Error(
      "La posición no tiene un precio de compra registrado. Actualiza los datos de compra antes de vender."
    );
  }

  // ── Financial calculations ────────────────────────────────────────────────
  const investedAmount   = round2(sharesToSell * buyPrice);
  const revenueAmount    = round2(sharesToSell * sellPrice);
  const profitAmount     = round2(revenueAmount - investedAmount);
  const profitPercentage = round2((profitAmount / investedAmount) * 100);

  // ── Persist the closed operation ──────────────────────────────────────────
  const operation = await createClosedOperation({
    stockId,
    ticker:  stock.ticker,
    shares:  sharesToSell,
    buyPrice,
    sellPrice,
    investedAmount,
    revenueAmount,
    profitAmount,
    profitPercentage,
  });

  // ── Update or close the position ──────────────────────────────────────────
  const remaining = round2(currentQty - sharesToSell);
  const positionClosed = remaining <= 1e-9;

  if (positionClosed) {
    await removeStockById(stockId);
  } else {
    await updateStockQuantity(stockId, remaining);
  }

  return { operation, remainingShares: positionClosed ? 0 : remaining, positionClosed };
}

/**
 * Returns all closed operations for a user with portfolio-level profit aggregates.
 */
export async function getClosedPerformance(userId: string): Promise<ClosedPerformance> {
  const operations = await getClosedOperationsByUser(userId);

  if (operations.length === 0) {
    return {
      operations,
      totalInvested:     0,
      totalRevenue:      0,
      totalProfitAmount: 0,
      totalProfitPct:    0,
    };
  }

  const totalInvested     = round2(operations.reduce((s, o) => s + o.investedAmount, 0));
  const totalRevenue      = round2(operations.reduce((s, o) => s + o.revenueAmount,  0));
  const totalProfitAmount = round2(totalRevenue - totalInvested);
  const totalProfitPct    = totalInvested > 0
    ? round2((totalProfitAmount / totalInvested) * 100)
    : 0;

  return { operations, totalInvested, totalRevenue, totalProfitAmount, totalProfitPct };
}
