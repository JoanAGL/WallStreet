export interface HarvestAlert {
  ticker: string;
  latentLoss: number;      // negative number, in USD
  purchasePrice: number;
  currentPrice: number;
  quantity: number;
  alternative?: string;    // suggested ETF
}

const ETF_ALTERNATIVES: Record<string, string> = {
  AAPL: "QQQ",  MSFT: "QQQ",  GOOGL: "QQQ", AMZN: "QQQ", META: "QQQ",
  NVDA: "SOXX", AMD: "SOXX",  INTC: "SOXX",
  TSLA: "XLY",  GM: "XLY",   F: "XLY",
  JPM: "XLF",   BAC: "XLF",  GS: "XLF",   MS: "XLF",
  JNJ: "XLV",   PFE: "XLV",  UNH: "XLV",
  XOM: "XLE",   CVX: "XLE",
  WMT: "XLP",   PG: "XLP",   KO: "XLP",
};

const HARVEST_THRESHOLD = 100; // USD

export function detectHarvestOpportunities(
  stocks: { ticker: string; purchasePrice: number | null; currentPrice: number; quantity: number | null }[]
): HarvestAlert[] {
  const alerts: HarvestAlert[] = [];
  for (const s of stocks) {
    if (s.purchasePrice == null || s.quantity == null) continue;
    const latentLoss = (s.currentPrice - s.purchasePrice) * s.quantity;
    if (latentLoss < -HARVEST_THRESHOLD) {
      alerts.push({
        ticker: s.ticker,
        latentLoss,
        purchasePrice: s.purchasePrice,
        currentPrice: s.currentPrice,
        quantity: s.quantity,
        alternative: ETF_ALTERNATIVES[s.ticker.toUpperCase()],
      });
    }
  }
  return alerts.sort((a, b) => a.latentLoss - b.latentLoss); // worst first
}
