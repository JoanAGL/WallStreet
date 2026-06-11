import { prisma } from "@/lib/prisma";

const YAHOO_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ── Yahoo Finance ISIN resolver ───────────────────────────────────────────────

interface YFSearchQuote {
  symbol:    string;
  shortname?: string;
  longname?:  string;
  quoteType?: string;
}
interface YFSearchResponse {
  quotes?: YFSearchQuote[];
}

async function resolveTickerFromIsin(
  isin: string
): Promise<{ ticker: string; name: string } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4_000); // 4s per ISIN
    try {
      const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=3&newsCount=0&listsCount=0`;
      const res = await fetch(url, {
        headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as YFSearchResponse;
      const quote =
        data.quotes?.find((q) => q.quoteType === "EQUITY" || q.quoteType === "ETF") ??
        data.quotes?.[0];
      if (!quote?.symbol) return null;
      return {
        ticker: quote.symbol.toUpperCase(),
        name:   quote.longname ?? quote.shortname ?? quote.symbol,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null; // timeout or network error → ISIN added to isinsFailed
  }
}

async function resolveIsinBatch(
  isins: string[]
): Promise<Map<string, { ticker: string; name: string }>> {
  const result     = new Map<string, { ticker: string; name: string }>();
  const unique     = Array.from(new Set(isins.filter(Boolean)));
  const BATCH_SIZE = 8;   // increased from 3 — Yahoo Finance handles 8 in parallel fine
  const PAUSE_MS   = 100; // reduced from 250ms

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch   = unique.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((isin) => resolveTickerFromIsin(isin)));
    batch.forEach((isin, idx) => {
      if (results[idx]) result.set(isin, results[idx]!);
    });
    if (i + BATCH_SIZE < unique.length) await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  return result;
}

// ── CSV parsing ───────────────────────────────────────────────────────────────

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function normHeader(h: string): string {
  return stripAccents(h.trim()).toLowerCase();
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      result.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

function parseDegNum(s: string): number {
  return parseFloat((s ?? "").trim().replace(/"/g, "").replace(",", "."));
}

function parseDegDate(fecha: string, hora: string): Date {
  const [d, mo, y] = fecha.split(/[-/]/).map(Number);
  const [h = 0, m = 0] = (hora || "00:00").split(":").map(Number);
  if (!y || !mo || !d) return new Date();
  return new Date(y, mo - 1, d, h, m, 0, 0);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface DegiroRow {
  fecha:    string;
  hora:     string;
  producto: string;
  isin:     string;
  numero:   number;
  precio:   number;   // always in USD (converted at parse time)
  fee:      number;   // transaction costs in USD (converted at parse time)
  orderId:  string;   // DEGIRO order ID for partial-fill grouping
}

export interface ImportResult {
  imported:      number;
  skipped:       number;
  stocksCreated: number;
  isinsFailed:   string[];
}

// ── FIX-1: merge partial fills that share the same order ID ──────────────────

/**
 * DEGIRO splits large orders into multiple rows with the same Order ID but
 * different execution venues. This function collapses those into a single row:
 * total shares = sum of partials, price = WAC of partials.
 * Rows without an Order ID are passed through untouched.
 */
function mergePartialFills(rows: DegiroRow[]): DegiroRow[] {
  const individual: DegiroRow[] = [];
  const groups     = new Map<string, DegiroRow[]>();

  for (const row of rows) {
    const tipo = row.numero > 0 ? "BUY" : "SELL";
    if (!row.orderId) {
      individual.push(row);
      continue;
    }
    const key = `${row.orderId}|${row.isin}|${tipo}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const merged: DegiroRow[] = individual.slice();

  for (const group of Array.from(groups.values())) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }
    const first    = group[0];
    const tipo     = first.numero > 0 ? "BUY" : "SELL";
    const totalAbs = group.reduce((s, r) => s + Math.abs(r.numero), 0);
    const wacPrice = group.reduce((s, r) => s + Math.abs(r.numero) * r.precio, 0) / totalAbs;
    const totalFee = group.reduce((s, r) => s + r.fee, 0);
    merged.push({
      ...first,
      numero: tipo === "BUY" ? totalAbs : -totalAbs,
      precio: Math.round(wacPrice * 10000) / 10000,
      fee:    Math.round(totalFee * 100) / 100,
    });
  }

  // Re-sort chronologically after merging
  merged.sort((a, b) => parseDegDate(a.fecha, a.hora).getTime() - parseDegDate(b.fecha, b.hora).getTime());
  return merged;
}

// ── Main import function ──────────────────────────────────────────────────────

export async function importDegiroCSV(
  buffer: Buffer,
  userId: string
): Promise<ImportResult> {
  const text     = buffer.toString("utf-8").replace(/^﻿/, "");
  const allLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (allLines.length < 2) throw new Error("El archivo CSV está vacío.");

  const headerIdx = allLines.findIndex((l) => {
    const first = normHeader(parseCSVLine(l)[0] ?? "");
    return first === "fecha" || first === "date";
  });
  if (headerIdx < 0) {
    throw new Error(
      "Cabecera no encontrada. Exporta desde DEGIRO → Actividad → Transacciones."
    );
  }

  const rawHeaders = parseCSVLine(allLines[headerIdx]);
  const col: Record<string, number> = {};
  rawHeaders.forEach((h, i) => {
    const n = normHeader(h);
    if (n && !(n in col)) col[n] = i;
  });

  for (const req of ["fecha", "producto", "isin", "numero", "precio"]) {
    if (!(req in col)) throw new Error(`Columna requerida "${req}" no encontrada.`);
  }

  const horaKey = "hora" in col ? "hora" : null;

  // FIX-3: resolve order-ID column with multiple name variants
  const orderIdKey = ["id orden", "idorden", "id_orden", "order id", "orderid"]
    .find((k) => k in col) ?? null;

  // FIX-2: resolve exchange-rate column
  const fxKey = ["tipo de cambio", "tipo cambio", "exchange rate"]
    .find((k) => k in col) ?? null;

  // Costes de transacción (comisión del broker por operación)
  const feeKey = ["costes de transaccion", "costes de transaccion y/o", "transaction costs", "transaction and/or third"]
    .find((k) => k in col) ?? null;

  // ── Parse data rows ──────────────────────────────────────────────────────
  const rows: DegiroRow[] = [];
  for (const line of allLines.slice(headerIdx + 1)) {
    const cells   = parseCSVLine(line);
    const fecha   = (cells[col["fecha"]] ?? "").trim();
    if (!fecha) continue;

    const hora     = horaKey ? (cells[col[horaKey]] ?? "00:00").trim() : "00:00";
    const producto = (cells[col["producto"]] ?? "").trim();
    const isin     = (cells[col["isin"]] ?? "").trim();
    const numero   = parseDegNum(cells[col["numero"]] ?? "");
    const precio   = parseDegNum(cells[col["precio"]] ?? "");

    if (!isin || !isFinite(numero) || numero === 0) continue;
    if (!isFinite(precio) || precio <= 0) continue;

    // Currency is the unnamed column immediately after "precio" (e.g. "USD", "EUR")
    const currency    = (cells[col["precio"] + 1] ?? "").trim().toUpperCase() || "USD";
    // Exchange rate on this row (e.g. 1.1630 means 1 EUR = 1.1630 USD)
    const fxRate      = fxKey ? parseDegNum(cells[col[fxKey]] ?? "") : NaN;
    // Convert to USD at parse time so mergePartialFills WAC is always in USD
    const precioFinal = (currency !== "USD" && isFinite(fxRate) && fxRate > 0)
      ? Math.round(precio * fxRate * 10000) / 10000
      : precio;

    // Costes de transacción: DEGIRO los expresa en la divisa de la cuenta y
    // negativos (cargo). La divisa va en la columna sin nombre siguiente; si
    // no es USD se convierte con el mismo tipo de cambio de la fila.
    let fee = 0;
    if (feeKey) {
      const rawFee = parseDegNum(cells[col[feeKey]] ?? "");
      if (isFinite(rawFee) && rawFee !== 0) {
        const feeCurrency = (cells[col[feeKey] + 1] ?? "").trim().toUpperCase() || "USD";
        const absFee = Math.abs(rawFee);
        fee = (feeCurrency !== "USD" && isFinite(fxRate) && fxRate > 0)
          ? Math.round(absFee * fxRate * 100) / 100
          : Math.round(absFee * 100) / 100;
      }
    }

    // Order ID (Bug A: used to collapse partial fills of the same order)
    const orderId = orderIdKey ? (cells[col[orderIdKey]] ?? "").trim() : "";

    rows.push({ fecha, hora, producto, isin, numero, precio: precioFinal, fee, orderId });
  }
  if (rows.length === 0) throw new Error("No se encontraron transacciones válidas en el archivo.");

  // CRITICAL: DEGIRO exports newest-first → reverse for chronological WAC
  rows.reverse();

  // FIX-1: collapse partial fills of the same order into a single row
  const mergedRows = mergePartialFills(rows);

  // ── Phase 1: resolve ISINs via Yahoo Finance ──────────────────────────────
  const uniqueIsins = Array.from(new Set(mergedRows.map((r) => r.isin).filter(Boolean)));
  const resolved    = await resolveIsinBatch(uniqueIsins);
  const isinsFailed = uniqueIsins.filter((i) => !resolved.has(i));

  // ── Phase 2: find or create Stocks ───────────────────────────────────────
  const stockCache = new Map<string, string>(); // isin → stockId
  let stocksCreated = 0;

  for (const isin of uniqueIsins) {
    const info   = resolved.get(isin);
    const ticker =
      info?.ticker ??
      (() => {
        const row = mergedRows.find((r) => r.isin === isin);
        return row?.producto.replace(/[^A-Z0-9]/gi, "").toUpperCase().substring(0, 8) ?? isin.substring(0, 8);
      })();
    const name = info?.name ?? mergedRows.find((r) => r.isin === isin)?.producto ?? isin;

    let stock =
      await prisma.stock.findFirst({ where: { isin, userId } }) ??
      await prisma.stock.findUnique({ where: { ticker_userId: { ticker, userId } } });

    if (!stock) {
      stock = await prisma.stock.create({ data: { userId, ticker, isin, name } });
      stocksCreated++;
    } else if (!stock.isin || !stock.name) {
      stock = await prisma.stock.update({
        where: { id: stock.id },
        data:  { isin: stock.isin ?? isin, name: stock.name ?? name },
      });
    }
    stockCache.set(isin, stock.id);
  }

  // ── Phase 3: bulk-fetch existing transactions for deduplication ───────────
  const stockIds = Array.from(new Set(Array.from(stockCache.values())));
  const existingTxs = await prisma.transaction.findMany({
    where:  { stockId: { in: stockIds } },
    select: { stockId: true, type: true, shares: true, price: true, date: true },
  });
  const dedupSet = new Set(
    existingTxs.map((t) =>
      `${t.stockId}|${t.type}|${t.shares}|${t.price}|${t.date?.getTime() ?? 0}`
    )
  );

  // ── Phase 4: build insert list ────────────────────────────────────────────
  type TxInsert = {
    stockId: string; type: "BUY" | "SELL"; shares: number; price: number; fee: number; date: Date;
  };
  const toInsert: TxInsert[] = [];

  for (const row of mergedRows) {
    const stockId = stockCache.get(row.isin);
    if (!stockId) continue;

    const type   = row.numero > 0 ? "BUY" : "SELL";
    const shares = Math.abs(row.numero);
    const date   = parseDegDate(row.fecha, row.hora);

    // row.precio is already in USD (converted at parse time, before mergePartialFills)
    // La fee no entra en la clave de dedupe: reimportar un CSV antiguo sin
    // columna de costes no debe duplicar transacciones ya existentes.
    const key = `${stockId}|${type}|${shares}|${row.precio}|${date.getTime()}`;
    if (!dedupSet.has(key)) {
      toInsert.push({ stockId, type, shares, price: row.precio, fee: row.fee, date });
      dedupSet.add(key);
    }
  }
  const skipped = mergedRows.length - toInsert.length;

  // ── Phase 5: bulk insert ──────────────────────────────────────────────────
  if (toInsert.length > 0) {
    await prisma.transaction.createMany({ data: toInsert });
  }

  // ── Phase 6: recompute WAC → update Stock.quantity / purchasePrice ────────
  for (const [, stockId] of Array.from(stockCache)) {
    const allTxs = await prisma.transaction.findMany({
      where:   { stockId },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    let open = 0, avgCost = 0;
    for (const t of allTxs) {
      if (t.type === "SPLIT") {
        // shares = factor del split: ajusta acciones y coste medio
        if (t.shares > 0 && open > 0) {
          open    = Math.round(open * t.shares * 1e6) / 1e6;
          avgCost = avgCost / t.shares;
        }
      } else if (t.type === "DIVIDEND") {
        // renta: no altera la posición
      } else if (t.type === "BUY") {
        const total = avgCost * open + t.price * t.shares + (t.fee ?? 0);
        open    = Math.round((open + t.shares) * 1e6) / 1e6;
        avgCost = open > 0 ? total / open : 0;
      } else {
        open = Math.round(Math.max(0, open - t.shares) * 1e6) / 1e6;
      }
    }
    await prisma.stock.update({
      where: { id: stockId },
      data: {
        quantity:      Math.round(open * 1e6) / 1e6,
        purchasePrice: avgCost > 0 ? Math.round(avgCost * 100) / 100 : null,
      },
    });
  }

  return { imported: toInsert.length, skipped, stocksCreated, isinsFailed };
}
