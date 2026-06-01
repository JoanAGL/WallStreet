import type { TopMover } from "@/app/api/market/top-gainers/route";

async function fetchTopGainers(): Promise<TopMover[]> {
  try {
    const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const res = await fetch(`${base}/api/market/top-gainers`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { gainers: TopMover[] };
    return data.gainers ?? [];
  } catch {
    return [];
  }
}

export default async function TopMovers() {
  const gainers = await fetchTopGainers();
  if (gainers.length === 0) return null;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Top 5 mayores subidas hoy (S&amp;P 100)
      </p>
      <ul className="space-y-2">
        {gainers.map((g) => (
          <li key={g.ticker} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="font-semibold text-sm text-gray-900">{g.ticker}</span>
              <span className="ml-2 text-xs text-gray-500 truncate">{g.name}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm text-gray-700">${g.price.toFixed(2)}</span>
              <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                +{g.changePercent.toFixed(2)}%
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
