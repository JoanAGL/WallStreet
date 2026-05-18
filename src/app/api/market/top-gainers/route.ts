import { NextResponse } from "next/server";

export interface TopMover {
  ticker:        string;
  name:          string;
  price:         number;
  changePercent: number;
}

interface YahooQuote {
  symbol:                      string;
  shortName?:                  string;
  regularMarketPrice?:         number;
  regularMarketChangePercent?: number;
  quoteType?:                  string;
}
interface YahooQuoteResponse { quoteResponse: { result: YahooQuote[] } }

// Curated S&P 100 tickers to screen for top gainers
const TICKERS = [
  "AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","BRK.B","UNH","LLY",
  "JPM","V","XOM","JNJ","MA","AVGO","PG","HD","COST","ABBV",
  "MRK","CVX","PEP","KO","ADBE","WMT","BAC","MCD","ORCL","CRM",
  "ACN","ABT","TMO","CSCO","LIN","DHR","TXN","AMD","NFLX","INTC",
  "WFC","QCOM","PM","UNP","RTX","HON","AMGN","IBM","INTU","AMAT",
  "GE","NEE","LOW","CAT","SPGI","AXP","GILD","MS","VRTX","ELV",
  "MDT","BLK","SYK","PLD","REGN","ADI","PANW","MMC","SBUX","ISRG",
  "LRCX","TJX","CI","GS","DE","MDLZ","BMY","C","MO","PGR",
  "CB","DUK","SO","ETN","CME","COP","SLB","FI","MCO","APH",
];

export async function GET() {
  try {
    // Yahoo Finance batch quote — split into two requests to stay under URL limit
    const half = Math.ceil(TICKERS.length / 2);
    const chunks = [TICKERS.slice(0, half), TICKERS.slice(half)];

    const allQuotes: YahooQuote[] = [];

    for (const chunk of chunks) {
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${chunk.join(",")}&fields=symbol,shortName,regularMarketPrice,regularMarketChangePercent,quoteType`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        next: { revalidate: 3600 }, // cache 1h in Next.js data cache
      });
      if (!res.ok) continue;
      const data = (await res.json()) as YahooQuoteResponse;
      allQuotes.push(...(data.quoteResponse?.result ?? []));
    }

    const gainers: TopMover[] = allQuotes
      .filter(
        (q) =>
          q.quoteType === "EQUITY" &&
          q.regularMarketChangePercent != null &&
          q.regularMarketChangePercent > 0 &&
          q.regularMarketPrice != null
      )
      .sort((a, b) => (b.regularMarketChangePercent ?? 0) - (a.regularMarketChangePercent ?? 0))
      .slice(0, 5)
      .map((q) => ({
        ticker:        q.symbol,
        name:          q.shortName ?? q.symbol,
        price:         q.regularMarketPrice!,
        changePercent: q.regularMarketChangePercent!,
      }));

    return NextResponse.json({ gainers });
  } catch {
    return NextResponse.json({ gainers: [] });
  }
}
