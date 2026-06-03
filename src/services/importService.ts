import { prisma } from "@/lib/prisma";

// ── CSV helpers ───────────────────────────────────────────────────────────────

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
  const parts = fecha.split(/[-/]/);
  if (parts.length !== 3) return new Date();
  const [d, mo, y] = parts.map(Number);
  const [h = 0, m = 0] = (hora || "00:00").split(":").map(Number);
  return new Date(y, mo - 1, d, h, m, 0, 0);
}

// ── ISIN → Ticker lookup (primary source of truth) ────────────────────────────
// Covers the most commonly traded stocks on DEGIRO. ISIN is the authoritative key.
const ISIN_TICKER: Record<string, string> = {
  // ── US Large Cap ──────────────────────────────────────────────────────────
  "US0378331005": "AAPL",   "US5949181045": "MSFT",   "US88160R1014": "TSLA",
  "US0231351067": "AMZN",   "US02079K3059": "GOOGL",  "US02079K1079": "GOOG",
  "US67066G1040": "NVDA",   "US30303M1027": "META",   "US79466L3024": "CRM",
  "US64110L1061": "NFLX",   "US4592001014": "IBM",    "US46625H1005": "GS",
  "US17275R1023": "CSCO",   "US4370761029": "HON",    "US0605051046": "BAC",
  "US1667641005": "C",      "US9311421039": "WFC",    "US7170811035": "PFE",
  "US4781601046": "JPM",    "US2058871029": "COIN",   "US0304201033": "AMGN",
  "US1101221083": "BMY",    "US58933Y1055": "MRK",    "US0028241000": "ABBV",
  "US6311031081": "MO",     "US7512121010": "RTX",    "US09075V1026": "BIDU",
  "US9314271084": "WMT",    "US2553341034": "DIS",    "US5128071082": "LMT",
  "US57636Q1040": "MA",     "US92826C8394": "V",      "US7475251036": "PYPL",
  "US6745991058": "ORCL",   "US30231G1022": "XOM",    "US69608A1088": "PANW",
  "US7134481081": "PEP",    "US5801351017": "MCD",    "US4943681035": "KO",
  "US7181721090": "PG",     "US44919PAB49": "HD",     "US4824801009": "JNJ",
  "US2926922004": "ELV",    "US91324P1021": "UNH",    "US2649449098": "DVN",
  "US2561631068": "DE",     "US6516391066": "NOW",    "US0527691069": "AVGO",
  "US1255231003": "CF",     "US2364331011": "D",      "US2615095017": "DUK",
  "US26969F1066": "EBAY",   "US3674321050": "GE",     "US4385161066": "HPQ",
  "US49456B1017": "KMI",    "US5184391044": "LIN",    "US52736R1023": "LH",
  "US5581881023": "MMM",    "US5765141084": "MRO",    "US6153691059": "FO",
  "US6263216040": "NSC",    "US68389X1054": "ORAN",   "US7033431072": "PNC",
  "US7232851016": "PM",     "US7427181091": "PSA",    "US7554821080": "SBUX",
  "US8168511090": "SHW",    "US8355681049": "SNPS",   "US8581891009": "STZ",
  "US8736141028": "TMO",    "US8873173038": "TRV",    "US9113121068": "USB",
  "US9182041080": "UPS",    "US92276F1003": "VLO",    "US9456861010": "WBA",
  "US9694571004": "WM",     "US88554D2053": "TSM",    "US0079031078": "ADBE",
  "US00724F1012": "ADSK",   "US8825081040": "TGT",    "US46434G1031": "IVV",
  "US78462F1030": "SPY",    "US0320951017": "AIG",    "US0188021085": "AFL",
  "US2220702037": "CRWD",   "US40434L1052": "HCA",    "US87612E1064": "TDG",
  "US0642871031": "BK",     "US1266501006": "CVS",    "US1491501045": "CMG",
  "US22160K1051": "COST",   "US09702L1052": "BLK",    "US0126531013": "ADM",
  "US03662Q1058": "APD",    "US0382221051": "APA",    "US12504L1098": "CI",
  "US20825C1045": "COP",    "US2091151041": "CNP",    "US2358511028": "DAL",
  "US2424391015": "DHR",    "US2538681030": "DG",     "US2910111044": "EMR",
  "US3024913036": "ETN",    "US3135531090": "FDX",    "US3453708600": "FOX",
  "US3687361044": "GIS",    "US3920711097": "HIG",    "US4364401012": "HOG",
  "US4401441000": "HUM",    "US46120E6023": "ICE",    "US5007541064": "KR",
  "US50077L1070": "KLAC",   "US51476Q1031": "LHX",    "US53944K1007": "LOW",
  "US5398301094": "LUV",    "US55616P1049": "MPC",    "US5890491021": "MDT",
  "US60126E1010": "MOH",    "US6093091041": "MS",     "US6531031052": "NKE",
  "US6594001054": "NOC",    "US6668071029": "OXY",    "US6826801036": "PH",
  "US69361F1049": "PPG",    "US7443201051": "PRU",    "US7561091049": "RF",
  "US7960508882": "SLB",    "US8318652091": "SO",     "US8425871071": "SYF",
  "US9024941034": "TT",     "US9168961038": "UAL",    "US9343951062": "WDC",
  "US0793745031": "BA",     "US40570W1036": "HAL",    "US30040W1080": "F",
  "US6708371033": "GM",     "US8492421030": "SPOT",   "US09248X1081": "UBER",
  "US29786A1060": "ETSY",   "US26210C1045": "DKNG",   "US36467W1099": "GME",
  "US74834L1008": "PTON",   "US89832Q1094": "TTD",    "US5330341012": "LI",
  "US23804L1035": "DASH",   "US64110D1046": "NET",    "US09259E1082": "BILI",
  "US55087P1049": "MELI",   "US40425J1016": "HLT",    "US2333311072": "ZM",
  "US91332U1016": "UNP",    "US8816242098": "TFC",    "US0790212011": "BA2",
  "US3765361080": "GLD",    "US2605571031": "DD",     "US2786421030": "ECL",
  // ── Semiconductores ───────────────────────────────────────────────────────
  "US1090872235": "MU",     "US4523271090": "INTC",   "US03664B1035": "AMD",
  "US6951921034": "QCOM",   "US87238U2033": "TXN",    "US8574771031": "SWKS",
  // ── ETF más comunes en DEGIRO ─────────────────────────────────────────────
  "IE00B4L5Y983": "IWDA",   "IE00B5BMR087": "CSPX",   "IE00B0M62Q58": "IMEU",
  "IE00B3RBWM25": "VUSA",   "IE00B4K48X80": "EMIM",   "IE0031442068": "IUSA",
  "LU0908500753": "EXXT",   "IE00B52MJY50": "SSAC",   "IE00B3WJKG14": "SMEA",
  "LU0533033667": "DBXD",   "IE00BKX55T58": "EQQQ",   "IE00B1XNHC34": "IQQQ",
  "IE00B6R52259": "EMIM2",  "US46090E7912": "IYF",    "US46137V3160": "IYW",
  // ── España ────────────────────────────────────────────────────────────────
  "ES0113860A34": "SAB",    "ES0113900J37": "SAN",    "ES0171996056": "BBVA",
  "ES0130670112": "ITX",    "ES0173516115": "TEF",    "ES0167050915": "REE",
  "ES0116870314": "MAP",    "ES0141801019": "CIE",    "ES0105490001": "FER",
  "ES0184933812": "SGRE",   "ES0178430E18": "ROVI",   "ES0126775032": "ACX",
  // ── Europa ────────────────────────────────────────────────────────────────
  "NL0010273215": "ASML",   "DE0007164600": "SAP",    "FR0000131104": "BNP",
  "GB0005405286": "AZN",    "CH0012221716": "ABB",    "DE0005140008": "DBK",
  "FR0000120628": "ACA",    "GB00B10RZP78": "ULVR",   "FR0003500008": "MC",
  "NL0000009082": "PHIA",   "DE000A1EWWW0": "ADS",    "FR0000131920": "TTE",
  "DE0008404005": "ALV",    "GB0002875804": "BP",      "DE0005552004": "BMW",
  "FR0000073272": "AIR",    "GB0031348658": "VOD",     "FI0009000681": "NOK",
  "SE0000108656": "ERIC",   "DK0062498333": "NOVO",    "DE0007236101": "SIE",
  "GB0007188757": "GSK",    "NL0015436031": "SHEL",    "FR0000120271": "SGO",
  "CH0012214059": "NOVN",   "IT0003128367": "ENI",     "IT0004176001": "ISP",
  "IT0000072618": "UCG",    "FR0000131087": "RMS",     "NL0000009165": "AKZA",
  "NL0012969182": "RAND",   "DE0007664039": "VOW3",    "NL0011821202": "NN",
};

// Words that appear in company names but are never real tickers
const NON_TICKER_WORDS = new Set([
  "INC", "CORP", "CO", "SA", "SL", "PLC", "LTD", "AG", "NV", "SE", "AB",
  "LLC", "LP", "LLP", "BANK", "BANCO", "BANCORP", "GROUP", "HOLDINGS",
  "TRUST", "FUND", "ETF", "UCITS", "ACC", "DIST", "AND", "THE", "OF",
  "DE", "DEL", "NEW", "OLD", "COMMON", "STOCK", "CLASS", "GLOBAL",
  "INTERNATIONAL", "FINANCIAL", "ENERGY", "TECHNOLOGY", "HEALTHCARE",
  "CAPITAL", "MANAGEMENT", "SERVICES", "SOLUTIONS", "SYSTEMS", "US",
  "EUR", "USD", "GBP",
]);

/**
 * Resolves the best ticker for a DEGIRO product row.
 * Priority: ISIN lookup → parentheses extraction → safe word extraction.
 * ISIN is always the dedup key; this ticker is display-only.
 */
function extractTicker(producto: string, isin: string): string {
  // 1. Known ISIN → authoritative ticker
  if (isin && ISIN_TICKER[isin]) return ISIN_TICKER[isin];

  const s = producto.trim();

  // 2. Already looks like a ticker (short, caps, no spaces)
  if (/^[A-Z0-9.]{1,7}$/.test(s)) return s;

  // 3. Explicit parentheses: "Apple Inc (AAPL)" → AAPL
  const paren = s.match(/\(([A-Z0-9.]{1,6})\)/);
  if (paren) return paren[1];

  // 4. Find a word that looks like a ticker AND is not a common non-ticker word
  for (const w of s.split(/\s+/)) {
    const up = w.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (up.length >= 2 && up.length <= 5 && /^[A-Z]/.test(up) && !NON_TICKER_WORDS.has(up)) {
      return up;
    }
  }

  // 5. Fallback: cleaned first meaningful word, max 6 chars
  for (const w of s.split(/\s+/)) {
    const up = w.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (up.length >= 2 && !NON_TICKER_WORDS.has(up)) {
      return up.substring(0, 6);
    }
  }

  // 6. Last resort: derive from ISIN (country + 4 chars of NSIN)
  return (isin ? isin.substring(0, 2) + isin.substring(2, 6) : s.replace(/\W/g, "").substring(0, 6)).toUpperCase();
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface DegiroRow {
  fecha: string; hora: string; producto: string; isin: string;
  numero: number; precio: number; valorEur: number;
}

export interface ImportResult {
  imported: number; skipped: number; stocksCreated: number;
}

// ── Main import function ──────────────────────────────────────────────────────

export async function importDegiroCSV(buffer: Buffer, userId: string): Promise<ImportResult> {
  const text = buffer.toString("utf-8").replace(/^﻿/, "");
  const allLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  if (allLines.length < 2) throw new Error("El archivo CSV está vacío.");

  const headerIdx = allLines.findIndex((l) => {
    const first = normHeader(parseCSVLine(l)[0] ?? "");
    return first === "fecha" || first === "date";
  });
  if (headerIdx < 0) {
    throw new Error(
      "No se encontró la cabecera del CSV de DEGIRO. Exporta desde Actividad → Transacciones."
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

  const eurKey  = "valor eur" in col ? "valor eur" : "total";
  const horaKey = "hora" in col ? "hora" : null;

  const rows: DegiroRow[] = [];
  for (const line of allLines.slice(headerIdx + 1)) {
    const cells  = parseCSVLine(line);
    const fecha  = (cells[col["fecha"]] ?? "").trim();
    if (!fecha) continue;

    const hora     = horaKey ? (cells[col[horaKey]] ?? "00:00").trim() : "00:00";
    const producto = (cells[col["producto"]] ?? "").trim();
    const isin     = (cells[col["isin"]] ?? "").trim();
    const numero   = parseDegNum(cells[col["numero"]] ?? "");
    const precio   = parseDegNum(cells[col["precio"]] ?? "");
    const valorEur = parseDegNum(cells[col[eurKey] ?? -1] ?? "");

    if (!producto || !isFinite(numero) || numero === 0) continue;
    if (!isFinite(precio) || precio <= 0) continue;

    rows.push({ fecha, hora, producto, isin, numero, precio, valorEur: isFinite(valorEur) ? valorEur : 0 });
  }

  if (rows.length === 0) throw new Error("No se encontraron transacciones válidas en el archivo.");

  // CRITICAL: DEGIRO exports newest-first → reverse for chronological WAC
  rows.reverse();

  // ── Phase 1: find or create Stocks (outside any transaction) ─────────────
  // Process unique stocks in a single pass to avoid redundant DB calls
  const stockCache  = new Map<string, string>(); // cacheKey → stockId
  let stocksCreated = 0;

  const seenKeys = new Set<string>();
  for (const row of rows) {
    const ticker   = extractTicker(row.producto, row.isin);
    const cacheKey = row.isin || ticker;
    if (seenKeys.has(cacheKey)) continue;
    seenKeys.add(cacheKey);

    let stock = row.isin
      ? await prisma.stock.findFirst({ where: { isin: row.isin, userId } })
      : null;
    if (!stock) {
      stock = await prisma.stock.findUnique({ where: { ticker_userId: { ticker, userId } } });
    }
    if (!stock) {
      stock = await prisma.stock.create({
        data: { userId, ticker, isin: row.isin || undefined, name: row.producto || undefined },
      });
      stocksCreated++;
    } else if (!stock.isin && row.isin) {
      stock = await prisma.stock.update({
        where: { id: stock.id },
        data: { isin: row.isin, name: stock.name ?? row.producto },
      });
    }
    stockCache.set(cacheKey, stock.id);
  }

  // ── Phase 2: bulk-fetch existing transactions for deduplication ───────────
  // Load everything in one query → no per-row DB round trips
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

  // ── Phase 3: build insert list (in-memory dedup) ──────────────────────────
  type TxInsert = { stockId: string; type: "BUY" | "SELL"; shares: number; price: number; date: Date };
  const toInsert: TxInsert[] = [];

  for (const row of rows) {
    const ticker   = extractTicker(row.producto, row.isin);
    const cacheKey = row.isin || ticker;
    const stockId  = stockCache.get(cacheKey);
    if (!stockId) continue;

    const type   = row.numero > 0 ? "BUY" : "SELL";
    const shares = Math.abs(row.numero);
    const date   = parseDegDate(row.fecha, row.hora);
    const key    = `${stockId}|${type}|${shares}|${row.precio}|${date.getTime()}`;

    if (!dedupSet.has(key)) {
      toInsert.push({ stockId, type, shares, price: row.precio, date });
      dedupSet.add(key); // prevent duplicates within the same file
    }
  }

  const skipped = rows.length - toInsert.length;

  // ── Phase 4: bulk insert with createMany (atomic, no interactive tx) ──────
  if (toInsert.length > 0) {
    await prisma.transaction.createMany({ data: toInsert });
  }

  // ── Phase 5: recompute WAC → update Stock.quantity / purchasePrice ────────
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

  return { imported: toInsert.length, skipped, stocksCreated };
}
