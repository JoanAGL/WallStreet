import { NextRequest, NextResponse } from "next/server";

export interface SearchSuggestion {
  ticker:   string;
  name:     string;
  exchange: string;
  type:     string;
}

interface YahooSearchQuote {
  symbol:    string;
  shortname?: string;
  longname?:  string;
  exchange?:  string;
  quoteType?: string;
}

interface YahooSearchResponse {
  quotes: YahooSearchQuote[];
}

const EXCHANGE_LABELS: Record<string, string> = {
  NMS: "NASDAQ", NGM: "NASDAQ", NCM: "NASDAQ",
  NYQ: "NYSE",   NYA: "NYSE",
  PCX: "NYSE",   ASE: "NYSE",
};

// Simple in-process cache — avoids hammering Yahoo on every keystroke
const cache = new Map<string, { data: SearchSuggestion[]; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ suggestions: [] });

  const key = q.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ suggestions: cached.data });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&enableFuzzyQuery=false`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 0 },
    });

    if (!res.ok) return NextResponse.json({ suggestions: [] });

    const data = (await res.json()) as YahooSearchResponse;

    const suggestions: SearchSuggestion[] = (data.quotes ?? [])
      .filter((q) => q.quoteType === "EQUITY" && q.symbol && !q.symbol.includes("."))
      .slice(0, 6)
      .map((q) => ({
        ticker:   q.symbol,
        name:     q.shortname ?? q.longname ?? q.symbol,
        exchange: EXCHANGE_LABELS[q.exchange ?? ""] ?? q.exchange ?? "",
        type:     "Equity",
      }));

    cache.set(key, { data: suggestions, ts: Date.now() });
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
