import { prisma } from "@/lib/prisma";

// ── CSV helpers ───────────────────────────────────────────────────────────────

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normHeader(h: string): string {
  return stripAccents(h.trim()).toLowerCase();
}

/** Parses a single CSV line handling quoted fields that may contain commas. */
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

/** Converts DEGIRO numeric strings like "\"209,5000\"" or "-3602,75" to float. */
function parseDegNum(s: string): number {
  return parseFloat((s ?? "").trim().replace(/"/g, "").replace(",", "."));
}

/** Parses DEGIRO date (DD-MM-YYYY) and time (HH:MM) into a JS Date. */
function parseDegDate(fecha: string, hora: string): Date {
  const parts = fecha.split(/[-/]/);
  if (parts.length !== 3) return new Date();
  const [d, mo, y] = parts.map(Number);
  const [h = 0, m = 0] = (hora || "00:00").split(":").map(Number);
  return new Date(y, mo - 1, d, h, m, 0, 0);
}

/**
 * Extracts a ticker from a DEGIRO product string.
 * Strategy: parentheses match → already-short-caps → first caps word → fallback.
 */
function extractTicker(producto: string, isin: string): string {
  const s = producto.trim();
  if (/^[A-Z0-9.]{1,7}$/.test(s)) return s;
  const paren = s.match(/\(([A-Z0-9.]{1,6})\)/);
  if (paren) return paren[1];
  for (const w of s.split(/\s+/)) {
    const up = w.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (up.length >= 2 && up.length <= 6 && /^[A-Z]/.test(up)) return up;
  }
  const fallback = s.replace(/[^A-Z0-9]/gi, "").toUpperCase().substring(0, 8);
  return fallback || isin.substring(2, 8);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface DegiroRow {
  fecha:    string;
  hora:     string;
  producto: string;
  isin:     string;
  numero:   number;   // positive = BUY, negative = SELL
  precio:   number;
  valorEur: number;
}

export interface ImportResult {
  imported:      number;
  skipped:       number;
  stocksCreated: number;
}

// ── Main import function ──────────────────────────────────────────────────────

export async function importDegiroCSV(
  buffer: Buffer,
  userId: string
): Promise<ImportResult> {
  const text = buffer.toString("utf-8").replace(/^﻿/, ""); // strip BOM
  const allLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  if (allLines.length < 2) throw new Error("El archivo CSV está vacío.");

  // Find the header row (first column normalises to "fecha" or "date")
  const headerIdx = allLines.findIndex((l) => {
    const first = normHeader(parseCSVLine(l)[0] ?? "");
    return first === "fecha" || first === "date";
  });
  if (headerIdx < 0) {
    throw new Error(
      "No se encontró la cabecera del CSV de DEGIRO. Asegúrate de exportar las transacciones desde la sección 'Actividad → Transacciones'."
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

  // DEGIRO may name the EUR total "valor eur" or "total"
  const eurKey = "valor eur" in col ? "valor eur" : "total";
  const horaKey = "hora" in col ? "hora" : null;

  // Parse data rows
  const rows: DegiroRow[] = [];
  for (const line of allLines.slice(headerIdx + 1)) {
    const cells = parseCSVLine(line);
    const fecha = (cells[col["fecha"]] ?? "").trim();
    if (!fecha) continue;

    const hora     = horaKey ? (cells[col[horaKey]] ?? "00:00").trim() : "00:00";
    const producto = (cells[col["producto"]] ?? "").trim();
    const isin     = (cells[col["isin"]] ?? "").trim();
    const numero   = parseDegNum(cells[col["numero"]] ?? "");
    const precio   = parseDegNum(cells[col["precio"]] ?? "");
    const valorEur = parseDegNum(cells[col[eurKey] ?? -1] ?? "");

    // Skip non-trading rows (dividends, deposits, currency ops have numero=0)
    if (!producto || !isFinite(numero) || numero === 0) continue;
    if (!isFinite(precio) || precio <= 0) continue;

    rows.push({ fecha, hora, producto, isin, numero, precio, valorEur: isFinite(valorEur) ? valorEur : 0 });
  }

  if (rows.length === 0) {
    throw new Error("No se encontraron transacciones válidas (compras/ventas) en el archivo.");
  }

  // CRITICAL: DEGIRO exports newest-first → reverse for chronological WAC
  rows.reverse();

  // ── Atomic DB import ──────────────────────────────────────────────────────
  let imported      = 0;
  let skipped       = 0;
  let stocksCreated = 0;

  await prisma.$transaction(
    async (tx) => {
      const stockCache = new Map<string, string>(); // cacheKey → stockId

      // ── Phase 1: find or create Stocks ─────────────────────────────────
      for (const row of rows) {
        const ticker   = extractTicker(row.producto, row.isin);
        const cacheKey = row.isin || ticker;
        if (stockCache.has(cacheKey)) continue;

        // Lookup: ISIN → ticker → create
        let stock = row.isin
          ? await tx.stock.findFirst({ where: { isin: row.isin, userId } })
          : null;

        if (!stock) {
          stock = await tx.stock.findUnique({
            where: { ticker_userId: { ticker, userId } },
          });
        }

        if (!stock) {
          stock = await tx.stock.create({
            data: {
              userId,
              ticker,
              isin: row.isin || undefined,
              name: row.producto || undefined,
            },
          });
          stocksCreated++;
        } else if (!stock.isin && row.isin) {
          stock = await tx.stock.update({
            where: { id: stock.id },
            data: { isin: row.isin, name: stock.name ?? row.producto },
          });
        }

        stockCache.set(cacheKey, stock.id);
      }

      // ── Phase 2: insert Transactions (with deduplication) ──────────────
      for (const row of rows) {
        const ticker   = extractTicker(row.producto, row.isin);
        const cacheKey = row.isin || ticker;
        const stockId  = stockCache.get(cacheKey);
        if (!stockId) continue;

        const type   = row.numero > 0 ? "BUY" : "SELL";
        const shares = Math.abs(row.numero);
        const txDate = parseDegDate(row.fecha, row.hora);

        const exists = await tx.transaction.findFirst({
          where: { stockId, type, shares, price: row.precio, date: txDate },
        });
        if (exists) { skipped++; continue; }

        await tx.transaction.create({
          data: { stockId, type, shares, price: row.precio, date: txDate },
        });
        imported++;
      }

      // ── Phase 3: recompute WAC → update Stock.quantity / purchasePrice ──
      for (const [, stockId] of Array.from(stockCache)) {
        const txs = await tx.transaction.findMany({
          where:   { stockId },
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        });

        let open    = 0;
        let avgCost = 0;
        for (const t of txs) {
          if (t.type === "BUY") {
            const total = avgCost * open + t.price * t.shares;
            open        = Math.round((open + t.shares) * 1e6) / 1e6;
            avgCost     = open > 0 ? total / open : 0;
          } else {
            open = Math.round(Math.max(0, open - t.shares) * 1e6) / 1e6;
          }
        }

        await tx.stock.update({
          where: { id: stockId },
          data: {
            quantity:      Math.round(open * 1e6) / 1e6,
            purchasePrice: avgCost > 0 ? Math.round(avgCost * 100) / 100 : null,
          },
        });
      }
    },
    { timeout: 30_000 }
  );

  return { imported, skipped, stocksCreated };
}
