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
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--fg-5)" }}>
        Top 5 mayores subidas hoy (S&amp;P 100)
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 9 }}>
        {gainers.map((g) => (
          <li key={g.ticker} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span>
              <strong style={{ fontSize: 14, color: "var(--fg-1)" }}>{g.ticker}</strong>
              <span style={{ fontSize: 12, color: "var(--fg-5)", marginLeft: 8 }}>{g.name}</span>
            </span>
            <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ fontSize: 14, color: "var(--fg-3)" }}>${g.price.toFixed(2)}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#4ADE80", background: "rgba(16,163,74,.12)", border: "1px solid rgba(16,163,74,.35)", padding: "2px 10px", borderRadius: 9999 }}>
                +{g.changePercent.toFixed(2)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
