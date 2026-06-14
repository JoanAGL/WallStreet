import { NextRequest, NextResponse } from "next/server";

const YAHOO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const ticker = searchParams.get("ticker")?.toUpperCase();
  const years  = Math.min(30, Math.max(1, Number(searchParams.get("years") ?? "10")));

  if (!ticker) return NextResponse.json({ error: "ticker requerido" }, { status: 400 });

  try {
    const range = years <= 1 ? "1y" : years <= 2 ? "2y" : years <= 5 ? "5y" : "10y";
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&range=${range}&includePrePost=false`;

    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return NextResponse.json({ error: `Yahoo ${res.status}` }, { status: 502 });

    const data = await res.json() as {
      chart: {
        result: [{
          timestamp: number[];
          indicators: { adjclose?: [{ adjclose: (number | null)[] }]; quote: [{ close: (number | null)[] }] };
        }] | null;
        error: unknown;
      };
    };

    if (data.chart.error || !data.chart.result?.[0]) {
      return NextResponse.json({ error: "Sin datos" }, { status: 404 });
    }

    const result    = data.chart.result[0];
    const rawCloses = result.indicators.adjclose?.[0]?.adjclose
      ?? result.indicators.quote[0]?.close
      ?? [];

    const points: { date: string; price: number }[] = [];
    result.timestamp.forEach((ts, i) => {
      const p = rawCloses[i];
      if (p != null && p > 0) {
        points.push({ date: new Date(ts * 1000).toISOString().slice(0, 7), price: p });
      }
    });

    return NextResponse.json({ ticker, points });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
