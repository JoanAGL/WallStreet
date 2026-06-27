import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStocksByUser } from "@/repositories/stockRepository";

export const dynamic = "force-dynamic";

const YAHOO_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const TWO_YEARS_S = 2 * 365 * 24 * 3600;

interface WeeklyCandles {
  timestamps: number[];
  closes: number[];
}

async function fetchWeeklyCandles(
  ticker: string,
  fromTs: number,
  toTs: number
): Promise<WeeklyCandles | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1wk&period1=${fromTs}&period2=${toTs}`;
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA },
      signal: AbortSignal.timeout(6_000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      chart: {
        result: Array<{
          timestamp: number[];
          indicators: { quote: Array<{ close: (number | null)[] }> };
        }> | null;
      };
    };
    const result = data?.chart?.result?.[0];
    if (!result || !result.timestamp?.length) return null;

    const rawCloses = result.indicators.quote[0]?.close ?? [];
    const timestamps: number[] = [];
    const closes: number[] = [];

    for (let i = 0; i < result.timestamp.length; i++) {
      const c = rawCloses[i];
      if (c != null && isFinite(c) && c > 0) {
        timestamps.push(result.timestamp[i]);
        closes.push(c);
      }
    }

    return timestamps.length > 0 ? { timestamps, closes } : null;
  } catch {
    return null;
  }
}

export interface WeeklyPoint {
  date: string;       // "YYYY-MM-DD"
  value: number;      // sum(price_week × quantity) for open positions
  invested: number;   // sum(purchasePrice × quantity) for open positions
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const stocks = await getStocksByUser(session.user.id);

  // Only positions with full purchase data and quantity > 0
  const positions = stocks.filter(
    (s) =>
      s.purchaseDate != null &&
      s.purchasePrice != null &&
      s.purchasePrice > 0 &&
      s.quantity != null &&
      s.quantity > 0
  );

  if (positions.length === 0) {
    return NextResponse.json({ points: [] }, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=600" },
    });
  }

  const nowTs = Math.floor(Date.now() / 1000);
  const earliestPurchase = Math.min(
    ...positions.map((s) => Math.floor(s.purchaseDate!.getTime() / 1000))
  );
  const fromTs = Math.max(earliestPurchase, nowTs - TWO_YEARS_S);

  // Fetch weekly candles for all positions in parallel
  const candleResults = await Promise.allSettled(
    positions.map((s) => fetchWeeklyCandles(s.ticker, fromTs, nowTs))
  );

  // Collect all weekly timestamps from all stocks
  const allTsSet = new Set<number>();
  candleResults.forEach((r) => {
    if (r.status === "fulfilled" && r.value) {
      r.value.timestamps.forEach((ts) => allTsSet.add(ts));
    }
  });

  if (allTsSet.size === 0) {
    return NextResponse.json({ points: [] }, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=600" },
    });
  }

  const sortedTs = Array.from(allTsSet).sort((a, b) => a - b);

  // Build price maps per stock: timestamp → last-known price (forward fill)
  const priceMaps = positions.map((s, i) => {
    const candle = candleResults[i].status === "fulfilled" ? candleResults[i].value : null;
    if (!candle) return null;

    // Build sorted (ts, price) pairs
    const pairs = candle.timestamps.map((ts, j) => [ts, candle.closes[j]] as [number, number]);

    return {
      pairs,
      purchaseTs: Math.floor(s.purchaseDate!.getTime() / 1000),
      purchasePrice: s.purchasePrice!,
      quantity: s.quantity!,
    };
  });

  // For each weekly timestamp, compute portfolio value and invested capital
  const points: WeeklyPoint[] = [];

  for (const weekTs of sortedTs) {
    let totalValue = 0;
    let totalInvested = 0;
    let hasAnyPosition = false;

    for (const pm of priceMaps) {
      if (!pm) continue;
      // Position must have been opened before this week
      if (pm.purchaseTs > weekTs) continue;

      // Find latest price on or before weekTs (forward fill)
      let price: number | null = null;
      for (const [ts, p] of pm.pairs) {
        if (ts <= weekTs) price = p;
        else break;
      }
      if (price == null || price <= 0) continue;

      totalValue   += price * pm.quantity;
      totalInvested += pm.purchasePrice * pm.quantity;
      hasAnyPosition = true;
    }

    if (hasAnyPosition && totalValue > 0) {
      points.push({
        date: new Date(weekTs * 1000).toISOString().slice(0, 10),
        value: totalValue,
        invested: totalInvested,
      });
    }
  }

  return NextResponse.json({ points }, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=600" },
  });
}
