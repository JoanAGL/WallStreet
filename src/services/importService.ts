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

/**
 * Resolves a real market ticker and company name from an ISIN via Yahoo Finance
 * search. Returns null on any network error or when no result is found.
 * Times out after 6 seconds.
 */
async function resolveTickerFromIsin(
  isin: string
): Promise<{ ticker: string; name: string } | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=3&newsCount=0&listsCount=0`;
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as YFSearchResponse;

    // Prefer EQUITY/ETF results; fallback to first quote
    const quote =
      data.quotes?.find((q) => q.quoteType === "EQUITY" || q.quoteType === "ETF") ??
      data.quotes?.[0];

    if (!quote?.symbol) return null;
    return {
      ticker: quote.symbol.toUpperCase(),
      name:   quote.longname ?? quote.shortname ?? quote.symbol,
    };
  } catch {
    return null;
  }
}

/**
 * Resolves a batch of ISINs with rate-limiting (3 parallel, 250 ms between
 * batches). Returns a Map<isin, {ticker, name}> for all successfully resolved ones.
 */
async function resolveIsinBatch(
  isins: string[]
): Promise<Map<string, { ticker: string; name: string }>> {
  const result = new Map<string, { ticker: string; name: string }>();
  const unique  = Array.from(new Set(isins.filter(Boolean)));

  for (let i = 0; i < unique.length; i += 3) {
    const batch   = unique.slice(i, i + 3);
    const results = await Promise.all(batch.map((isin) => resolveTickerFromIsin(isin)));
    batch.forEach((isin, idx) => {
      if (results[idx]) result.set(isin, results[idx]!);
    });
    if (i + 3 < unique.length) await new Promise((r) => setTimeout(r, 250));
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

/** Converts DEGIRO numeric strings ("209,5000", "-3602,75") to float. */
function parseDegNum(s: string): number {
  return parseFloat((s ?? "").trim().replace(/"/g, "").replace(",", "."));
}

/** Parses DEGIRO date (DD-MM-YYYY) + time (HH:MM) into a JS Date. */
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
  precio:   number;
}

export interface ImportResult {
  imported:      number;
  skipped:       number;
  stocksCreated: number;
  isinsFailed:   string[];   // ISINs Yahoo Finance couldn't resolve
}

// ── Main import function ──────────────────────────────────────────────────────

export async function importDegiroCSV(
  buffer: Buffer,
  userId: string
): Promise<ImportResult> {
  // Strip BOM, split into lines
  const text     = buffer.toString("utf-8").replace(/^﻿/, "");
  const allLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (allLines.length < 2) throw new Error("El archivo CSV está vacío.");

  // Locate header row (first column normalises to "fecha" or "date")
  const headerIdx = allLines.findIndex((l) => {
    const first = normHeader(parseCSVLine(l)[0] ?? "");
    return first === "fecha" || first === "date";
  });
  if (headerIdx < 0) {
    throw new Error(
      "Cabecera no encontrada. Exporta desde DEGIRO → Actividad → Transacciones."
    );
  }

  // Build column-name → index map (skip empty headers = currency columns)
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

  // Parse data rows
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

    // Skip non-trading rows (dividends, deposits — numero === 0)
    if (!isin || !isFinite(numero) || numero === 0) continue;
    if (!isFinite(precio) || precio <= 0) continue;

    rows.push({ fecha, hora, producto, isin, numero, precio });
  }
  if (rows.length === 0) throw new Error("No se encontraron transacciones válidas en el archivo.");

  // CRITICAL: DEGIRO exports newest-first → reverse for chronological WAC
  rows.reverse();

  // ── Phase 1: resolve ISINs via Yahoo Finance ──────────────────────────────
  const uniqueIsins = Array.from(new Set(rows.map((r) => r.isin).filter(Boolean)));
  const resolved    = await resolveIsinBatch(uniqueIsins);
  const isinsFailed = uniqueIsins.filter((i) => !resolved.has(i));

  // ── Phase 2: find or create Stocks ───────────────────────────────────────
  const stockCache = new Map<string, string>(); // isin → stockId
  let stocksCreated = 0;

  for (const isin of uniqueIsins) {
    const info = resolved.get(isin);
    // Use Yahoo-resolved ticker; fall back to cleaned Producto of first row with this ISIN
    const ticker =
      info?.ticker ??
      (() => {
        const row = rows.find((r) => r.isin === isin);
        return row?.producto.replace(/[^A-Z0-9]/gi, "").toUpperCase().substring(0, 8) ?? isin.substring(0, 8);
      })();
    const name = info?.name ?? rows.find((r) => r.isin === isin)?.producto ?? isin;

    // Lookup: by ISIN first, then by ticker
    let stock =
      await prisma.stock.findFirst({ where: { isin, userId } }) ??
      await prisma.stock.findUnique({ where: { ticker_userId: { ticker, userId } } });

    if (!stock) {
      stock = await prisma.stock.create({
        data: { userId, ticker, isin, name },
      });
      stocksCreated++;
    } else {
      // Backfill ISIN/name if missing on existing stock
      if (!stock.isin || !stock.name) {
        stock = await prisma.stock.update({
          where: { id: stock.id },
          data: { isin: stock.isin ?? isin, name: stock.name ?? name },
        });
      }
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

  // ── Phase 4: build insert list (in-memory dedup) ──────────────────────────
  type TxInsert = {
    stockId: string; type: "BUY" | "SELL"; shares: number; price: number; date: Date;
  };
  const toInsert: TxInsert[] = [];

  for (const row of rows) {
    const stockId = stockCache.get(row.isin);
    if (!stockId) continue;

    const type   = row.numero > 0 ? "BUY" : "SELL";
    const shares = Math.abs(row.numero);
    const date   = parseDegDate(row.fecha, row.hora);
    const key    = `${stockId}|${type}|${shares}|${row.precio}|${date.getTime()}`;

    if (!dedupSet.has(key)) {
      toInsert.push({ stockId, type, shares, price: row.precio, date });
      dedupSet.add(key);
    }
  }
  const skipped = rows.length - toInsert.length;

  // ── Phase 5: bulk insert with createMany (no interactive transaction) ─────
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
      if (t.type === "BUY") {
        const total = avgCost * open + t.price * t.shares;
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
