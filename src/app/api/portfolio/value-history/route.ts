import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const YAHOO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchMonthlyPrices(ticker: string): Promise<Map<string, number>> {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&range=10y&includePrePost=false`;
    const res = await fetch(url, { headers: { "User-Agent": YAHOO_UA }, next: { revalidate: 3600 } });
    if (!res.ok) return new Map();

    const data = await res.json() as {
      chart: {
        result: [{
          timestamp: number[];
          indicators: { adjclose?: [{ adjclose: (number | null)[] }]; quote: [{ close: (number | null)[] }] };
        }] | null;
      };
    };

    const result = data.chart.result?.[0];
    if (!result) return new Map();

    const closes = result.indicators.adjclose?.[0]?.adjclose ?? result.indicators.quote[0]?.close ?? [];
    const map = new Map<string, number>();

    result.timestamp.forEach((ts, i) => {
      const p = closes[i];
      if (p != null && p > 0) {
        const d = new Date(ts * 1000);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        map.set(key, p);
      }
    });

    return map;
  } catch {
    return new Map();
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const userId = session.user.id;

  // Get all stocks with their transactions
  const stocks = await prisma.stock.findMany({
    where: { userId },
    include: {
      transactions: { orderBy: { date: "asc" } },
    },
  });

  const stocksWithTx = stocks.filter((s) => s.transactions.length > 0);
  if (stocksWithTx.length === 0) return NextResponse.json({ points: [] });

  // Fetch monthly prices for all tickers in parallel
  const pricesByTicker = new Map<string, Map<string, number>>();
  await Promise.all(
    stocksWithTx.map(async (s) => {
      const prices = await fetchMonthlyPrices(s.ticker);
      pricesByTicker.set(s.ticker, prices);
    })
  );

  // Find all months from earliest transaction to today
  const allDates = stocksWithTx.flatMap((s) =>
    s.transactions.map((tx) => tx.date ?? tx.createdAt)
  );
  if (allDates.length === 0) return NextResponse.json({ points: [] });

  const earliest = allDates.reduce((a, b) => (a < b ? a : b));
  const now = new Date();

  const months: string[] = [];
  const cur = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
  while (cur <= now) {
    months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }

  // For each month, compute portfolio value and cost basis
  const points: { date: string; value: number; cost: number }[] = [];

  for (const month of months) {
    const [yr, mo] = month.split("-").map(Number);
    const monthEnd = new Date(yr, mo, 0, 23, 59, 59).getTime(); // last day of month

    let totalValue = 0;
    let totalCost  = 0;

    for (const stock of stocksWithTx) {
      // Replay transactions up to this month end to get shares held
      const txsInPeriod = stock.transactions.filter((tx) => {
        const txTime = (tx.date ?? tx.createdAt).getTime();
        return txTime <= monthEnd;
      });

      if (txsInPeriod.length === 0) continue;

      let shares  = 0;
      let avgCost = 0;
      let costBasis = 0;

      for (const tx of txsInPeriod) {
        if (tx.type === "BUY") {
          const total = avgCost * shares + tx.price * tx.shares;
          shares  += tx.shares;
          avgCost  = shares > 0 ? total / shares : 0;
          costBasis = avgCost * shares;
        } else {
          const sell = Math.min(tx.shares, shares);
          shares = Math.max(0, shares - sell);
          costBasis = avgCost * shares;
        }
      }

      if (shares < 0.001) continue;

      // Get price for this month from Yahoo
      const prices = pricesByTicker.get(stock.ticker);
      const price  = prices?.get(month);
      if (!price) continue;

      totalValue += shares * price;
      totalCost  += costBasis;
    }

    if (totalValue > 0 || totalCost > 0) {
      points.push({ date: month, value: Math.round(totalValue * 100) / 100, cost: Math.round(totalCost * 100) / 100 });
    }
  }

  return NextResponse.json({ points });
}
