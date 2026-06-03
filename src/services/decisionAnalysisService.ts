import { prisma }                from "@/lib/prisma";
import { getTransactionsByUser } from "@/repositories/transactionRepository";

// ── SPY price history for S&P 500 benchmark ───────────────────────────────────
const SPY_HISTORY: [string, number][] = [
  ["2014-01-02", 184.69], ["2015-01-02", 205.71], ["2016-01-04", 201.02],
  ["2017-01-03", 225.24], ["2018-01-02", 267.56], ["2019-01-02", 249.92],
  ["2020-01-02", 324.87], ["2021-01-04", 374.43], ["2022-01-03", 479.58],
  ["2023-01-03", 380.82], ["2024-01-02", 476.46], ["2025-01-02", 589.33],
  ["2026-01-02", 562.00], ["2026-06-15", 534.00],
];

function getSpyPrice(date: Date): number {
  const pts = SPY_HISTORY.map(([d, p]) => [new Date(d).getTime(), p] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const ts = date.getTime();
  if (ts <= pts[0][0]) return pts[0][1];
  if (ts >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i++) {
    if (ts <= pts[i][0]) {
      const t = (ts - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
      return pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1]);
    }
  }
  return pts[pts.length - 1][1];
}
const SPY_NOW = getSpyPrice(new Date());

// ── Live price fetch from Yahoo Finance ───────────────────────────────────────
const YAHOO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function fetchCurrentPrice(ticker: string): Promise<number | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      chart: { result: [{ indicators: { quote: [{ close: (number | null)[] }] } }] | null };
    };
    const closes = data.chart.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const last   = [...closes].reverse().find((c) => c != null && c > 0);
    return last ?? null;
  } catch {
    return null;
  }
}

// ── Exported types ────────────────────────────────────────────────────────────

export interface DispositionEffect {
  avgDaysWinners: number;
  avgDaysLosers:  number;
  biasDetected:   boolean;
  insight:        string;
}

export interface PrematureSale {
  ticker:          string;
  sellPrice:       number;
  currentPrice:    number;
  shares:          number;
  missedProfit:    number;
  missedProfitPct: number;
}

export interface SP500Comparison {
  totalInvested:         number;
  portfolioRealizedGain: number;
  portfolioReturnPct:    number;
  spySimulatedGain:      number;
  spyReturnPct:          number;
  beatingMarket:         boolean;
  alphaPct:              number;
}

export interface DecisionEntry {
  ticker:      string;
  profitAmt:   number;
  profitPct:   number;
  holdingDays: number;
  date:        string;
  type:        "winner" | "loser";
}

export interface DecisionAnalysis {
  totalClosedTrades:   number;
  totalRealizedProfit: number;
  profitFactor:        number | null;
  disposition:         DispositionEffect;
  prematureSales:      PrematureSale[];
  sp500:               SP500Comparison;
  topDecisions:        DecisionEntry[];
  worstMistakes:       DecisionEntry[];
}

// ── Main analysis ─────────────────────────────────────────────────────────────

export async function getDecisionAnalysis(userId: string): Promise<DecisionAnalysis> {
  const allTxs = await getTransactionsByUser(userId);

  const stocks = await prisma.stock.findMany({
    where:  { userId },
    select: { id: true, ticker: true, analysis: { select: { price: true } } },
  });
  const tickerMap    = new Map(stocks.map((s) => [s.id, s.ticker]));
  const cachedPrice  = new Map(
    stocks.filter((s) => s.analysis?.price).map((s) => [s.id, s.analysis!.price!])
  );

  // Group transactions by stock
  const byStock = new Map<string, typeof allTxs>();
  for (const tx of allTxs) {
    if (!byStock.has(tx.stockId)) byStock.set(tx.stockId, []);
    byStock.get(tx.stockId)!.push(tx);
  }

  interface ClosedTrade {
    ticker:       string;
    stockId:      string;
    firstBuyDate: Date;
    sellDate:     Date;
    holdingDays:  number;
    sellPrice:    number;
    avgCost:      number;
    shares:       number;
    profitAmt:    number;
    profitPct:    number;
    investedUSD:  number;
  }
  const trades: ClosedTrade[] = [];
  const buyInvestments: { date: Date; amountUSD: number; stockId: string }[] = [];

  for (const [stockId, txs] of Array.from(byStock)) {
    const ticker  = tickerMap.get(stockId) ?? stockId;
    const sorted  = [...txs].sort((a, b) => {
      const da = (a.date ?? a.createdAt).getTime();
      const db = (b.date ?? b.createdAt).getTime();
      return da - db || a.createdAt.getTime() - b.createdAt.getTime();
    });

    let open = 0, avgCost = 0;
    let firstBuyDate: Date | null = null;

    for (const tx of sorted) {
      const txDate = tx.date ?? tx.createdAt;
      if (tx.type === "BUY") {
        if (!firstBuyDate) firstBuyDate = txDate;
        const total = avgCost * open + tx.price * tx.shares;
        open    = Math.round((open + tx.shares) * 1e6) / 1e6;
        avgCost = open > 0 ? total / open : 0;
        buyInvestments.push({ date: txDate, amountUSD: tx.price * tx.shares, stockId });
      } else if (open > 0 && firstBuyDate) {
        const sellable   = Math.min(tx.shares, open);
        const invested   = Math.round(sellable * avgCost * 100) / 100;
        const profitAmt  = Math.round(sellable * (tx.price - avgCost) * 100) / 100;
        const profitPct  = invested > 0 ? Math.round((profitAmt / invested) * 10000) / 100 : 0;
        const holding    = Math.max(0, Math.floor((txDate.getTime() - firstBuyDate.getTime()) / 86_400_000));
        trades.push({
          ticker, stockId, firstBuyDate, sellDate: txDate, holdingDays: holding,
          sellPrice: tx.price, avgCost, shares: sellable,
          profitAmt, profitPct, investedUSD: invested,
        });
        open = Math.round(Math.max(0, open - sellable) * 1e6) / 1e6;
      }
    }
  }

  // Profit Factor
  const totalGains  = trades.filter((t) => t.profitAmt > 0).reduce((s, t) => s + t.profitAmt, 0);
  const totalLosses = Math.abs(trades.filter((t) => t.profitAmt < 0).reduce((s, t) => s + t.profitAmt, 0));
  const profitFactor = totalLosses > 0 ? Math.round((totalGains / totalLosses) * 100) / 100 : null;

  // Disposition Effect
  const winners = trades.filter((t) => t.profitAmt > 0);
  const losers  = trades.filter((t) => t.profitAmt < 0);
  const avgDaysWinners = winners.length > 0
    ? Math.round(winners.reduce((s, t) => s + t.holdingDays, 0) / winners.length) : 0;
  const avgDaysLosers  = losers.length > 0
    ? Math.round(losers.reduce((s, t) => s + t.holdingDays, 0) / losers.length) : 0;
  const biasDetected = losers.length >= 2 && winners.length >= 2 && avgDaysLosers > avgDaysWinners * 1.3;
  const disposition: DispositionEffect = {
    avgDaysWinners, avgDaysLosers, biasDetected,
    insight: biasDetected
      ? `Sesgo detectado: retienes las posiciones perdedoras ${avgDaysLosers} días de media frente a ${avgDaysWinners} días en las ganadoras. Estás cortando las flores y regando las malas hierbas.`
      : winners.length + losers.length < 3
      ? "Necesitas más operaciones cerradas para evaluar el efecto disposición."
      : `Sin sesgo significativo. Ganadoras: ${avgDaysWinners} días · Perdedoras: ${avgDaysLosers} días de media.`,
  };

  // Premature Sales — fetch current prices from Yahoo Finance in parallel (with cache)
  const prematureSales: PrematureSale[] = [];
  const priceCache = new Map<string, number | null>(
    Array.from(cachedPrice.entries()).map(([k, v]) => [k, v] as [string, number | null])
  );

  for (const trade of trades) {
    let curPrice = priceCache.get(trade.stockId);
    if (curPrice === undefined) {
      const ticker = tickerMap.get(trade.stockId) ?? "";
      curPrice = ticker ? await fetchCurrentPrice(ticker) : null;
      priceCache.set(trade.stockId, curPrice);
    }
    // Skip if no price, not a >10% gain, or price is >5× sell price
    // (>5× almost certainly means the resolved ticker is wrong — different company)
    if (!curPrice || curPrice <= trade.sellPrice * 1.1) continue;
    if (curPrice > trade.sellPrice * 5) continue;
    const missed    = Math.round((curPrice - trade.sellPrice) * trade.shares * 100) / 100;
    const missedPct = Math.round(((curPrice - trade.sellPrice) / trade.sellPrice) * 10000) / 100;
    prematureSales.push({
      ticker:          trade.ticker,
      sellPrice:       trade.sellPrice,
      currentPrice:    curPrice,
      shares:          trade.shares,
      missedProfit:    missed,
      missedProfitPct: missedPct,
    });
  }
  prematureSales.sort((a, b) => b.missedProfit - a.missedProfit);

  // S&P 500 Comparison
  let totalInvested = 0, spySimulatedNow = 0;
  for (const inv of buyInvestments) {
    const spyAtBuy = getSpyPrice(inv.date);
    spySimulatedNow += (inv.amountUSD / spyAtBuy) * SPY_NOW;
    totalInvested   += inv.amountUSD;
  }
  const totalRealizedProfit = Math.round(trades.reduce((s, t) => s + t.profitAmt, 0) * 100) / 100;
  const portfolioReturnPct  = totalInvested > 0
    ? Math.round((totalRealizedProfit / totalInvested) * 10000) / 100 : 0;
  const spyGain      = Math.round((spySimulatedNow - totalInvested) * 100) / 100;
  const spyReturnPct = totalInvested > 0
    ? Math.round((spyGain / totalInvested) * 10000) / 100 : 0;
  const sp500: SP500Comparison = {
    totalInvested:         Math.round(totalInvested * 100) / 100,
    portfolioRealizedGain: totalRealizedProfit,
    portfolioReturnPct,
    spySimulatedGain:      spyGain,
    spyReturnPct,
    beatingMarket:         portfolioReturnPct > spyReturnPct,
    alphaPct:              Math.round((portfolioReturnPct - spyReturnPct) * 100) / 100,
  };

  const toEntry = (t: ClosedTrade): DecisionEntry => ({
    ticker:      t.ticker,
    profitAmt:   t.profitAmt,
    profitPct:   t.profitPct,
    holdingDays: t.holdingDays,
    date:        t.sellDate.toISOString().split("T")[0],
    type:        t.profitAmt >= 0 ? "winner" : "loser",
  });

  return {
    totalClosedTrades:   trades.length,
    totalRealizedProfit,
    profitFactor,
    disposition,
    prematureSales:      prematureSales.slice(0, 5),
    sp500,
    topDecisions:        [...trades].sort((a, b) => b.profitAmt - a.profitAmt).slice(0, 3).map(toEntry),
    worstMistakes:       [...trades].sort((a, b) => a.profitAmt - b.profitAmt).filter((t) => t.profitAmt < 0).slice(0, 3).map(toEntry),
  };
}
