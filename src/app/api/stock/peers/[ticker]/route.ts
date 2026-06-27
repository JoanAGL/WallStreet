import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

const FH_BASE = "https://finnhub.io/api/v1";

function getToken(): string {
  const t = process.env.FINNHUB_API_KEY;
  if (!t) throw new Error("FINNHUB_API_KEY missing");
  return t;
}

async function safeFetch(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface PeerData {
  ticker: string;
  price: number | null;
  changePercent: number | null;
  marketCap: number | null; // in millions USD
  pe: number | null;
  evEbitda: number | null;
  ps: number | null;
}

export async function GET(
  _req: Request,
  { params }: { params: { ticker: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ticker = params.ticker.toUpperCase();
  const tok = getToken();

  // 1. Get peer list from Finnhub
  const peersRaw = await safeFetch(
    `${FH_BASE}/stock/peers?symbol=${encodeURIComponent(ticker)}&token=${tok}`
  );
  if (!Array.isArray(peersRaw) || peersRaw.length === 0) {
    return NextResponse.json(
      { peers: [] },
      { headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=3600" } }
    );
  }

  // Include current ticker first, then peers (deduplicated, max 10 total)
  const peerList: string[] = [
    ticker,
    ...peersRaw.filter((t: unknown): t is string => typeof t === "string" && t !== ticker),
  ].slice(0, 10);

  // 2. Fetch quote + metrics in parallel for each peer
  const results = await Promise.allSettled(
    peerList.map(async (t) => {
      const [quoteRes, metricsRes] = await Promise.allSettled([
        safeFetch(`${FH_BASE}/quote?symbol=${encodeURIComponent(t)}&token=${tok}`),
        safeFetch(`${FH_BASE}/stock/metric?symbol=${encodeURIComponent(t)}&metric=all&token=${tok}`),
      ]);

      const q = (
        quoteRes.status === "fulfilled" ? quoteRes.value : null
      ) as { c?: number; dp?: number } | null;

      const rawMetrics = (
        metricsRes.status === "fulfilled" ? metricsRes.value : null
      ) as { metric?: Record<string, number | null> } | null;
      const m = rawMetrics?.metric ?? {};

      const n = (k: string): number | null => {
        const v = m[k];
        return typeof v === "number" && isFinite(v) ? v : null;
      };

      return {
        ticker: t,
        price: q?.c ?? null,
        changePercent: q?.dp ?? null,
        marketCap: n("marketCapitalization"),
        pe: n("peNormalizedAnnual") ?? n("peTTM"),
        evEbitda: n("enterpriseValueOverEBITDA") ?? n("evEbitda"),
        ps: n("psTTM"),
      } satisfies PeerData;
    })
  );

  // 3. Keep peers with valid price data, max 8
  const peers = results
    .filter(
      (r): r is PromiseFulfilledResult<PeerData> =>
        r.status === "fulfilled" && r.value.price != null && r.value.price > 0
    )
    .map((r) => r.value)
    .slice(0, 8);

  return NextResponse.json(
    { peers },
    { headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=3600" } }
  );
}
