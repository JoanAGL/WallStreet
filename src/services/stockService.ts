import {
  getStocksByUser,
  countActiveStocksByUser,
  findStockByTickerAndUser,
  addStock,
  updateStockHorizon,
  updateStockPurchaseData,
  removeStock,
} from "@/repositories/stockRepository";
import { validateTickerExists } from "@/lib/yahooFinanceClient";
import type { InvestmentHorizon } from "@/types/models";

const VALID_HORIZONS = new Set<InvestmentHorizon>(["SHORT_TERM", "MEDIUM_TERM", "LONG_TERM"]);

const MAX_STOCKS = 20;
// Formato válido: 1-5 letras mayúsculas, opcionalmente seguido de punto y más letras (ej: BRK.B)
const TICKER_REGEX = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;

export type StockServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; status: number };

export async function getUserStocks(userId: string) {
  return getStocksByUser(userId);
}

export async function addUserStock(
  ticker: string,
  userId: string
): Promise<StockServiceResult<{ ticker: string; userId: string }>> {
  const normalized = ticker.toUpperCase().trim();

  if (!TICKER_REGEX.test(normalized)) {
    return {
      success: false,
      error: "Ticker inválido. Usa formato NYSE/NASDAQ (ej: AAPL, MSFT, BRK.B)",
      status: 400,
    };
  }

  // Solo las posiciones activas consumen plazas: las cerradas (quantity = 0)
  // permanecen como histórico sin bloquear nuevas incorporaciones.
  const count = await countActiveStocksByUser(userId);
  if (count >= MAX_STOCKS) {
    return {
      success: false,
      error: `Límite alcanzado. Máximo ${MAX_STOCKS} acciones activas por usuario.`,
      status: 409,
    };
  }

  const existing = await findStockByTickerAndUser(normalized, userId);
  if (existing) {
    return {
      success: false,
      error: "Ya tienes esta acción en tu lista.",
      status: 409,
    };
  }

  const tickerExists = await validateTickerExists(normalized);
  if (!tickerExists) {
    return {
      success: false,
      error: `El ticker "${normalized}" no es válido o no existe en los mercados soportados.`,
      status: 400,
    };
  }

  const stock = await addStock(normalized, userId);
  return { success: true, data: stock };
}

export async function updateUserStockHorizon(
  ticker: string,
  userId: string,
  horizon: string
): Promise<StockServiceResult<{ ticker: string; investmentHorizon: InvestmentHorizon }>> {
  const normalized = ticker.toUpperCase().trim();

  if (!VALID_HORIZONS.has(horizon as InvestmentHorizon)) {
    return {
      success: false,
      error: "Horizonte inválido. Usa: SHORT_TERM, MEDIUM_TERM o LONG_TERM.",
      status: 400,
    };
  }

  const existing = await findStockByTickerAndUser(normalized, userId);
  if (!existing) {
    return {
      success: false,
      error: "Acción no encontrada en tu lista.",
      status: 404,
    };
  }

  const updated = await updateStockHorizon(normalized, userId, horizon as InvestmentHorizon);
  return { success: true, data: { ticker: updated.ticker, investmentHorizon: updated.investmentHorizon } };
}

export async function updateUserStockPurchaseData(
  ticker: string,
  userId: string,
  data: { purchasePrice: number | null; quantity: number | null; purchaseDate: Date | null }
): Promise<StockServiceResult<{ ticker: string }>> {
  const normalized = ticker.toUpperCase().trim();

  const existing = await findStockByTickerAndUser(normalized, userId);
  if (!existing) {
    return { success: false, error: "Acción no encontrada en tu lista.", status: 404 };
  }

  const updated = await updateStockPurchaseData(normalized, userId, data);
  return { success: true, data: { ticker: updated.ticker } };
}

export async function removeUserStock(
  ticker: string,
  userId: string
): Promise<StockServiceResult<null>> {
  const normalized = ticker.toUpperCase().trim();

  const existing = await findStockByTickerAndUser(normalized, userId);
  if (!existing) {
    return {
      success: false,
      error: "Acción no encontrada en tu lista.",
      status: 404,
    };
  }

  await removeStock(normalized, userId);
  return { success: true, data: null };
}
