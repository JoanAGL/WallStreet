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

/** Estado de la posición (acciones abiertas y WAC en USD) justo antes de `atMs`. */
function positionAt(txs: TransactionRecord[], atMs: number): { open: number; avg: number } {
  const sorted = [...txs].sort((a, b) => {
    const da = (a.date ?? a.createdAt).getTime();
    const db = (b.date ?? b.createdAt).getTime();
    return da - db || a.createdAt.getTime() - b.createdAt.getTime();
  });
  let open = 0, avg = 0;
  for (const tx of sorted) {
    if ((tx.date ?? tx.createdAt).getTime() >= atMs) break;
    if (tx.type === "SPLIT") {
      if (tx.shares > 0 && open > 0) { open *= tx.shares; avg /= tx.shares; }
    } else if (tx.type === "DIVIDEND") {
      continue;
    } else if (tx.type === "BUY") {
      const total = avg * open + tx.price * tx.shares + (tx.fee ?? 0);
      open += tx.shares;
      avg = open > 0 ? total / open : 0;
    } else {
      open = Math.max(0, open - Math.min(tx.shares, open));
    }
  }
  return { open, avg };
}

/**
 * Decide qué splits del histórico de Yahoo faltan por registrar.
 *
 * Salvaguardas contra dobles aplicaciones y datos ya ajustados:
 * - Solo eventos posteriores a la primera COMPRA con posición abierta en la
 *   fecha del evento.
 * - Se omite si ya existe una transacción SPLIT a ±7 días del evento.
 * - CORROBORACIÓN OBLIGATORIA: el WAC en la fecha del split, dividido por el
 *   factor, debe ser coherente con (a) el precio medio de las compras
 *   posteriores al split, o en su defecto (b) el precio de mercado actual.
 *   Sin esta comprobación, un historial mixto o ya ajustado (caso NFLX:
 *   compras registradas en precios post-split) se multiplicaría por error.
 *   Si no hay forma de corroborar, NO se auto-aplica — queda el registro
 *   manual desde el panel.
 */
export function computePendingSplits(
  txs: TransactionRecord[],
  events: SplitEvent[],
  currentPriceUSD?: number | null
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

    // Sin posición abierta en la fecha del evento, el split es un no-op
    const at = positionAt(txs, ev.date);
    if (at.open <= 1e-9 || at.avg <= 0) continue;

    // Corroboración: WAC pre-split / factor ≈ referencia post-split
    const postBuys = buys.filter((t) => (t.date ?? t.createdAt).getTime() > ev.date);
    let reference: number | null = null;
    if (postBuys.length > 0) {
      const shares = postBuys.reduce((s, t) => s + t.shares, 0);
      reference = postBuys.reduce((s, t) => s + t.price * t.shares, 0) / shares;
    } else if (currentPriceUSD != null && currentPriceUSD > 0) {
      reference = currentPriceUSD;
    }
    if (reference == null) continue; // sin referencia no se auto-aplica

    const impliedRatio = at.avg / (factor * reference);
    if (impliedRatio < 0.5 || impliedRatio > 2) {
      console.log(
        `[SPLITS] Split ${ev.numerator}:${ev.denominator} descartado: WAC pre-split ` +
        `${at.avg.toFixed(2)} / factor no es coherente con la referencia ${reference.toFixed(2)} ` +
        `(ratio ${impliedRatio.toFixed(2)}) — el historial parece ya ajustado.`
      );
      continue;
    }

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
  stocks: { id: string; ticker: string; currentPriceUSD?: number | null }[]
): Promise<number> {
  let inserted = 0;
  for (const s of stocks) {
    try {
      const txs = await getTransactionsByStock(s.id);
      if (txs.length === 0) continue;
      const events = await fetchSplitEvents(s.ticker);
      if (events.length === 0) continue;

      const pending = computePendingSplits(txs, events, s.currentPriceUSD ?? null);
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
