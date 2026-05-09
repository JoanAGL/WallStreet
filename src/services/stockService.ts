import {
  getStocksByUser,
  countStocksByUser,
  findStockByTickerAndUser,
  addStock,
  removeStock,
} from "@/repositories/stockRepository";

const MAX_STOCKS = 5;
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

  const count = await countStocksByUser(userId);
  if (count >= MAX_STOCKS) {
    return {
      success: false,
      error: `Límite alcanzado. Máximo ${MAX_STOCKS} acciones por usuario.`,
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

  const stock = await addStock(normalized, userId);
  return { success: true, data: stock };
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
