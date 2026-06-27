/**
 * Shared sector resolution logic.
 *
 * Priority:
 * 1. Static override map (ETFs, crypto, indices, commodities)
 * 2. Finnhub `finnhubIndustry` field (for individual stocks)
 * 3. European exchange suffix heuristic (individual equities, not ETFs)
 * 4. null (shown as "Sin clasificar" in UI)
 */

// ── Static overrides ──────────────────────────────────────────────────────────

const STATIC_SECTOR: Record<string, string> = {
  // RV USA ETFs
  SPY: "ETF EE.UU.", QQQ: "ETF EE.UU.", VTI: "ETF EE.UU.", IWM: "ETF EE.UU.",
  VOO: "ETF EE.UU.", IVV: "ETF EE.UU.", SCHB: "ETF EE.UU.", VUG: "ETF EE.UU.",
  ONEQ: "ETF EE.UU.", DIA: "ETF EE.UU.",
  // RV Global ETFs
  VT:   "ETF Global", ACWI: "ETF Global", VEA:  "ETF Global", EFA: "ETF Global",
  VXUS: "ETF Global", IXUS: "ETF Global",
  // RV Europe ETFs
  EWG: "ETF Europa", EWU: "ETF Europa", FEZ: "ETF Europa", VGK: "ETF Europa",
  // Fixed Income ETFs
  TLT:  "Renta Fija", AGG:  "Renta Fija", BND:  "Renta Fija", HYG: "Renta Fija",
  LQD:  "Renta Fija", SHY:  "Renta Fija", IEF:  "Renta Fija", VCIT: "Renta Fija",
  // Commodities
  GLD:  "Materias Primas", SLV: "Materias Primas", IAU: "Materias Primas",
  GDX:  "Materias Primas", USO: "Materias Primas", PDBC: "Materias Primas",
  // Crypto ETPs / trust
  GBTC: "Cripto", IBIT: "Cripto", FBTC: "Cripto", ETHA: "Cripto", BITO: "Cripto",
  // Real estate
  VNQ: "Inmobiliario", IYR: "Inmobiliario", SCHH: "Inmobiliario",
  // Crypto spot/futures tickers (Yahoo/Coingecko style)
  "BTC-USD": "Cripto", "ETH-USD": "Cripto", "BNB-USD": "Cripto",
  "SOL-USD": "Cripto", "ADA-USD": "Cripto", "XRP-USD": "Cripto",
  BTCUSD: "Cripto", ETHUSD: "Cripto",
  // Gold / commodity futures
  "GC=F": "Materias Primas", "CL=F": "Materias Primas", "SI=F": "Materias Primas",
  // Major indices (as tradeable instruments)
  "^GSPC": "Índice", "^NDX": "Índice", "^DJI": "Índice",
  "^GDAXI": "Índice", "^FTSE": "Índice", "^IBEX": "Índice",
};

// Finnhub industry → español (keep original if not mapped)
const FINNHUB_TO_SECTOR: Record<string, string> = {
  "Technology":              "Tecnología",
  "Healthcare":              "Salud",
  "Financial Services":      "Financiero",
  "Consumer Cyclical":       "Consumo Cíclico",
  "Consumer Defensive":      "Consumo Defensivo",
  "Energy":                  "Energía",
  "Industrials":             "Industrial",
  "Communication Services":  "Comunicaciones",
  "Basic Materials":         "Materias Primas",
  "Real Estate":             "Inmobiliario",
  "Utilities":               "Utilities",
  "Semiconductor":           "Semiconductores",
  "Software":                "Software",
  "Biotechnology":           "Biotecnología",
  "Pharmaceuticals":         "Farmacéutico",
  "Banks":                   "Banca",
  "Insurance":               "Seguros",
  "Retail":                  "Retail",
  "Automotive":              "Automoción",
  "Aerospace & Defense":     "Aeroespacial y Defensa",
  "Food & Beverages":        "Alimentación",
  "Media":                   "Media",
  "Telecommunications":      "Telecomunicaciones",
  "Transportation":          "Transporte",
  "Electric Utilities":      "Utilities",
  "Gas Utilities":           "Utilities",
  "Oil & Gas":               "Energía",
};

const EUROPEAN_SUFFIXES = [".MC", ".PA", ".L", ".CO", ".AS", ".MI", ".F", ".DE", ".SW", ".BR", ".LS", ".OL", ".ST"];

/**
 * Resolves the display sector for a ticker.
 * @param ticker  Stock ticker symbol (e.g. "AAPL", "NOVO-B.CO")
 * @param finnhubIndustry  Raw finnhubIndustry string from Finnhub profile2 (optional)
 */
export function resolveSector(ticker: string, finnhubIndustry?: string | null): string | null {
  const upper = ticker.toUpperCase();

  // 1. Static overrides (ETFs, crypto, indices)
  if (STATIC_SECTOR[upper]) return STATIC_SECTOR[upper];

  // 2. Finnhub industry for individual stocks
  if (finnhubIndustry) {
    return FINNHUB_TO_SECTOR[finnhubIndustry] ?? finnhubIndustry;
  }

  // 3. European equity heuristic — only as last resort (not ETFs)
  const isEuropean = EUROPEAN_SUFFIXES.some((s) => ticker.endsWith(s));
  if (isEuropean) return "RV Europa";

  return null;
}

// ── Color palette ─────────────────────────────────────────────────────────────

export const SECTOR_COLORS: Record<string, string> = {
  "ETF EE.UU.":       "#3b82f6",
  "ETF Europa":       "#8b5cf6",
  "ETF Global":       "#6366f1",
  "Renta Fija":       "#22c55e",
  "Materias Primas":  "#f59e0b",
  "Cripto":           "#ec4899",
  "Inmobiliario":     "#14b8a6",
  "Tecnología":       "#0ea5e9",
  "Salud":            "#10b981",
  "Financiero":       "#f97316",
  "Consumo Cíclico":  "#a78bfa",
  "Consumo Defensivo":"#6ee7b7",
  "Energía":          "#fbbf24",
  "Industrial":       "#94a3b8",
  "Comunicaciones":   "#e879f9",
  "Semiconductores":  "#38bdf8",
  "Software":         "#818cf8",
  "Biotecnología":    "#34d399",
  "Farmacéutico":     "#4ade80",
  "Banca":            "#fb923c",
  "Seguros":          "#fca5a5",
  "Retail":           "#c084fc",
  "Automoción":       "#64748b",
  "Aeroespacial y Defensa": "#475569",
  "Alimentación":     "#86efac",
  "Telecomunicaciones":"#67e8f9",
  "Transporte":       "#a3a3a3",
  "Utilities":        "#bef264",
  "RV Europa":        "#7c3aed",
  "Índice":           "#6b7280",
  "Otros":            "#9ca3af",
  "Sin clasificar":   "#d1d5db",
};

export function sectorColor(sector: string): string {
  return SECTOR_COLORS[sector] ?? "#6b7280";
}
