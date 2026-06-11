import { cacheGet, cacheSet } from "@/lib/cacheStore";
import {
  getTransactionsByStock,
  createTransaction,
  type TransactionRecord,
} from "@/repositories/transactionRepository";
import { syncStockPosition } from "./transactionService";

const YAHOO_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SPLITS_CACHE_TTL = 24 * 3600;       // 24h por ticker
const MATCH_WINDOW_MS  = 7 * 86_400_000;  // un SPLIT existente a ±7 días del evento cuenta como ya registrado

export interface SplitEvent {
  date:        number;  // ms epoch
  numerator:   number;
  denominator: number;
}

/** Splits corporativos del ticker vía Yahoo (chart events=splits), caché 24h. */
export async function fetchSplitEvents(ticker: string): Promise<SplitEvent[]> {
  const key = `splits:${ticker}`;
  const cached = await cacheGet<SplitEvent[]>(key);
  if (cached) return cached;

  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=10y&events=splits`;
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      chart: { result: [{
        events?: { splits?: Record<string, { date: number; numerator: number; denominator: number }> };
      }] | null };
    };
    const splits = data.chart.result?.[0]?.events?.splits ?? {};
    const events: SplitEvent[] = Object.values(splits)
      .filter((s) => s.numerator > 0 && s.denominator > 0 && s.date > 0)
      .map((s) => ({ date: s.date * 1000, numerator: s.numerator, denominator: s.denominator }));

    await cacheSet(key, events, SPLITS_CACHE_TTL); // también vacío: evita re-consultar 24h
    return events;
  } catch {
    return []; // fallo de red: sin caché, se reintenta en la próxima actualización
  }
}

export interface PendingSplit {
  date:   Date;
  factor: number;  // shares de la transacción SPLIT (10 = 10:1, 0.1 = 1:10)
  label:  string;  // "10:1"
}

/**
 * Decide qué splits del histórico de Yahoo faltan por registrar.
 * Seguro frente a dobles aplicaciones:
 * - Solo eventos posteriores a la primera COMPRA (los anteriores son no-op
 *   para la posición y solo añadirían ruido).
 * - Se omite si ya existe una transacción SPLIT a ±7 días del evento
 *   (registrada a mano o por una detección anterior).
 */
export function computePendingSplits(
  txs: TransactionRecord[],
  events: SplitEvent[]
): PendingSplit[] {
  const buys = txs.filter((t) => t.type === "BUY");
  if (buys.length === 0) return [];
  const firstBuy = Math.min(...buys.map((t) => (t.date ?? t.createdAt).getTime()));
  const existingSplits = txs.filter((t) => t.type === "SPLIT");

  const pending: PendingSplit[] = [];
  for (const ev of events) {
    if (ev.date <= firstBuy || ev.date > Date.now()) continue;
    const factor = ev.numerator / ev.denominator;
    if (!isFinite(factor) || factor <= 0 || factor === 1) continue;
    const already = existingSplits.some(
      (s) => Math.abs((s.date ?? s.createdAt).getTime() - ev.date) <= MATCH_WINDOW_MS
    );
    if (already) continue;
    pending.push({
      date:   new Date(ev.date),
      factor: Math.round(factor * 1e6) / 1e6,
      label:  `${ev.numerator}:${ev.denominator}`,
    });
  }
  pending.sort((a, b) => a.date.getTime() - b.date.getTime());
  return pending;
}

/**
 * Detecta y registra splits pendientes para las posiciones con transacciones.
 * Pensado para ejecutarse en cada actualización de datos (la caché de 24h por
 * ticker lo hace barato). Los SPLIT insertados llevan nota "Auto-detectado" y
 * pueden eliminarse desde el panel si el usuario no está de acuerdo — el WAC
 * se recalcula solo.
 */
export async function detectAndRegisterSplits(
  stocks: { id: string; ticker: string }[]
): Promise<number> {
  let inserted = 0;
  for (const s of stocks) {
    try {
      const txs = await getTransactionsByStock(s.id);
      if (txs.length === 0) continue;
      const events = await fetchSplitEvents(s.ticker);
      if (events.length === 0) continue;

      const pending = computePendingSplits(txs, events);
      for (const p of pending) {
        await createTransaction({
          stockId: s.id,
          type:    "SPLIT",
          shares:  p.factor,
          price:   1,
          date:    p.date,
          notes:   `Auto-detectado (Yahoo): split ${p.label}`,
        });
        inserted++;
        console.log(`[SPLITS] ${s.ticker}: split ${p.label} registrado (${p.date.toISOString().slice(0, 10)})`);
      }
      if (pending.length > 0) await syncStockPosition(s.id);
    } catch (err) {
      console.warn(`[SPLITS] Detección falló para ${s.ticker}:`, err);
    }
  }
  return inserted;
}
