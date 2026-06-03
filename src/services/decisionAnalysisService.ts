import { prisma } from "@/lib/prisma";
import { getTransactionsByUser } from "@/repositories/transactionRepository";

// ── SPY price history (USD) for S&P 500 simulation ───────────────────────────
// Approximate year-start closing prices + current estimate (June 2026)
const SPY_DATA: [string, number][] = [
  ["2014-01-02", 184.69], ["2015-01-02", 205.71], ["2016-01-04", 201.02],
  ["2017-01-03", 225.24], ["2018-01-02", 267.56], ["2019-01-02", 249.92],
  ["2020-01-02", 324.87], ["2021-01-04", 374.43], ["2022-01-03", 479.58],
  ["2023-01-03", 380.82], ["2024-01-02", 476.46], ["2025-01-02", 589.33],
  ["2026-01-02", 562.00], ["2026-06-03", 534.00],
];

function getSpyPrice(date: Date): number {
  const pts = SPY_DATA.map(([d, p]) => [new Date(d).getTime(), p] as [number, number])
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

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DispositionEffect {
  avgDaysWinners:  number;
  avgDaysLosers:   number;
  biasDetected:    boolean;
  insight:         string;
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
  totalClosedTrades:  number;
  totalRealizedProfit: number;
  profitFactor:       number | null;
  disposition:        DispositionEffect;
  prematureSales:     PrematureSale[];
  sp500:              SP500Comparison;
  topDecisions:       DecisionEntry[];
  worstMistakes:      DecisionEntry[];
}

// ── Main analysis function ────────────────────────────────────────────────────

export async function getDecisionAnalysis(userId: string): Promise<DecisionAnalysis> {
  const allTxs = await getTransactionsByUser(userId);

  const stocks = await prisma.stock.findMany({
    where:  { userId },
    select: { id: true, ticker: true },
    include: { analysis: { select: { price: true } } },
  } as Parameters<typeof prisma.stock.findMany>[0]);

  const tickerMap    = new Map<string, string>();
  const currentPrice = new Map<string, number>();
  for (const s of stocks) {
    tickerMap.set(s.id, (s as { id: string; ticker: string }).ticker);
    const sa = (s as { analysis?: { price: number } | null }).analysis;
    if (sa?.price) currentPrice.set(s.id, sa.price);
  }

  // Group transactions by stock
  const byStock = new Map<string, typeof allTxs>();
  for (const tx of allTxs) {
    if (!byStock.has(tx.stockId)) byStock.set(tx.stockId, []);
    byStock.get(tx.stockId)!.push(tx);
  }

  // ── Per-stock analysis ────────────────────────────────────────────────────
  interface ClosedTrade {
    ticker:      string;
    stockId:     string;
    firstBuyDate: Date;
    sellDate:    Date;
    holdingDays: number;
    sellPrice:   number;
    avgCost:     number;
    shares:      number;
    profitAmt:   number;
    profitPct:   number;
    investedUSD: number;
  }

  const trades: ClosedTrade[]     = [];
  const buyInvestments: { date: Date; amountUSD: number; stockId: string }[] = [];

  for (const [stockId, txs] of Array.from(byStock)) {
    const ticker = tickerMap.get(stockId) ?? stockId;
    const sorted = [...txs].sort((a, b) => {
      const da = (a.date ?? a.createdAt).getTime();
      const db = (b.date ?? b.createdAt).getTime();
      return da - db || a.createdAt.getTime() - b.createdAt.getTime();
    });

    let openShares  = 0;
    let avgCost     = 0;
    let firstBuyDate: Date | null = null;

    for (const tx of sorted) {
      const txDate = tx.date ?? tx.createdAt;
      if (tx.type === "BUY") {
        if (!firstBuyDate) firstBuyDate = txDate;
        const total = avgCost * openShares + tx.price * tx.shares;
        openShares  = Math.round((openShares + tx.shares) * 1e6) / 1e6;
        avgCost     = openShares > 0 ? total / openShares : 0;
        buyInvestments.push({ date: txDate, amountUSD: tx.price * tx.shares, stockId });
      } else if (openShares > 0 && firstBuyDate) {
        const sellable   = Math.min(tx.shares, openShares);
        const profitAmt  = Math.round((sellable * (tx.price - avgCost)) * 100) / 100;
        const investedAmt = Math.round(sellable * avgCost * 100) / 100;
        const profitPct  = investedAmt > 0 ? Math.round((profitAmt / investedAmt) * 10000) / 100 : 0;
        const holding    = Math.max(0, Math.floor((txDate.getTime() - firstBuyDate.getTime()) / 86_400_000));

        trades.push({
          ticker, stockId,
          firstBuyDate,
          sellDate:    txDate,
          holdingDays: holding,
          sellPrice:   tx.price,
          avgCost,
          shares:      sellable,
          profitAmt,
          profitPct,
          investedUSD: investedAmt,
        });

        openShares = Math.round(Math.max(0, openShares - sellable) * 1e6) / 1e6;
      }
    }
  }

  // ── Profit Factor ─────────────────────────────────────────────────────────
  const totalGains  = trades.filter((t) => t.profitAmt > 0).reduce((s, t) => s + t.profitAmt, 0);
  const totalLosses = Math.abs(trades.filter((t) => t.profitAmt < 0).reduce((s, t) => s + t.profitAmt, 0));
  const profitFactor: number | null = totalLosses > 0 ? Math.round((totalGains / totalLosses) * 100) / 100 : null;

  // ── Disposition Effect ────────────────────────────────────────────────────
  const winners = trades.filter((t) => t.profitAmt > 0);
  const losers  = trades.filter((t) => t.profitAmt < 0);
  const avgDaysWinners = winners.length > 0
    ? Math.round(winners.reduce((s, t) => s + t.holdingDays, 0) / winners.length)
    : 0;
  const avgDaysLosers = losers.length > 0
    ? Math.round(losers.reduce((s, t) => s + t.holdingDays, 0) / losers.length)
    : 0;

  const biasDetected = losers.length >= 2 && winners.length >= 2 && avgDaysLosers > avgDaysWinners * 1.3;
  const disposition: DispositionEffect = {
    avgDaysWinners,
    avgDaysLosers,
    biasDetected,
    insight: biasDetected
      ? `Detectado sesgo de disposición: retienes las posiciones perdedoras ${avgDaysLosers} días de media frente a ${avgDaysWinners} días en las ganadoras. Estás "regando las malas hierbas y cortando las flores".`
      : winners.length + losers.length < 3
      ? "Aún no hay suficientes operaciones cerradas para evaluar el efecto disposición."
      : `No se detecta sesgo de disposición significativo. Las ganadoras se mantienen ${avgDaysWinners} días y las perdedoras ${avgDaysLosers} días de media.`,
  };

  // ── Premature Sales ───────────────────────────────────────────────────────
  const prematureSales: PrematureSale[] = [];
  for (const trade of trades) {
    const curPrice = currentPrice.get(trade.stockId);
    if (!curPrice || curPrice <= trade.sellPrice * 1.1) continue; // less than 10% upside → skip
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

  // ── S&P 500 Comparison ────────────────────────────────────────────────────
  let totalInvested    = 0;
  let spySimulatedNow  = 0;

  for (const inv of buyInvestments) {
    const spyPriceAtBuy = getSpyPrice(inv.date);
    const spyShares     = inv.amountUSD / spyPriceAtBuy;
    spySimulatedNow    += spyShares * SPY_NOW;
    totalInvested      += inv.amountUSD;
  }

  const totalRealizedProfit = Math.round(trades.reduce((s, t) => s + t.profitAmt, 0) * 100) / 100;
  const portfolioReturnPct  = totalInvested > 0
    ? Math.round((totalRealizedProfit / totalInvested) * 10000) / 100
    : 0;
  const spyGain         = Math.round((spySimulatedNow - totalInvested) * 100) / 100;
  const spyReturnPct    = totalInvested > 0
    ? Math.round((spyGain / totalInvested) * 10000) / 100
    : 0;

  const sp500: SP500Comparison = {
    totalInvested:         Math.round(totalInvested * 100) / 100,
    portfolioRealizedGain: totalRealizedProfit,
    portfolioReturnPct,
    spySimulatedGain:      spyGain,
    spyReturnPct,
    beatingMarket:         portfolioReturnPct > spyReturnPct,
    alphaPct:              Math.round((portfolioReturnPct - spyReturnPct) * 100) / 100,
  };

  // ── Top/Worst decisions ───────────────────────────────────────────────────
  const toEntry = (t: ClosedTrade): DecisionEntry => ({
    ticker:      t.ticker,
    profitAmt:   t.profitAmt,
    profitPct:   t.profitPct,
    holdingDays: t.holdingDays,
    date:        t.sellDate.toISOString().split("T")[0],
    type:        t.profitAmt >= 0 ? "winner" : "loser",
  });

  const topDecisions   = [...trades].sort((a, b) => b.profitAmt - a.profitAmt).slice(0, 3).map(toEntry);
  const worstMistakes  = [...trades].sort((a, b) => a.profitAmt - b.profitAmt).slice(0, 3).map(toEntry);

  return {
    totalClosedTrades:   trades.length,
    totalRealizedProfit,
    profitFactor,
    disposition,
    prematureSales:      prematureSales.slice(0, 5),
    sp500,
    topDecisions,
    worstMistakes,
  };
}
