"use client";

import type { StockWithAnalysis } from "@/types/models";
import { resolveSector, sectorColor } from "@/lib/sectorUtils";

interface SliceData {
  label:   string;
  value:   number;
  pct:     number;
  color:   string;
  tickers: string[];
}

function DonutChart({ slices }: { slices: SliceData[] }) {
  const R = 60;
  const cx = 80;
  const cy = 80;
  const stroke = 22;

  let cumAngle = -Math.PI / 2;
  const paths: { d: string; color: string; label: string }[] = [];

  for (const s of slices) {
    if (s.pct <= 0) continue;
    const angle = (s.pct / 100) * 2 * Math.PI;
    const x1 = cx + R * Math.cos(cumAngle);
    const y1 = cy + R * Math.sin(cumAngle);
    const x2 = cx + R * Math.cos(cumAngle + angle);
    const y2 = cy + R * Math.sin(cumAngle + angle);
    const large = angle > Math.PI ? 1 : 0;
    paths.push({
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`,
      color: s.color,
      label: s.label,
    });
    cumAngle += angle;
  }

  return (
    <svg viewBox="0 0 160 160" style={{ width: 120, height: 120, flexShrink: 0 }}>
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.color} stroke="var(--card-bg)" strokeWidth={2} />
      ))}
      {/* Center hole */}
      <circle cx={cx} cy={cy} r={R - stroke} fill="var(--card-bg)" />
    </svg>
  );
}

interface Props {
  stocks: StockWithAnalysis[];
}

export default function AssetAllocation({ stocks }: Props) {
  const withValue = stocks.filter(
    (s) => s.quantity != null && s.quantity > 0 && s.analysis?.price != null && s.analysis.price > 0
  );
  if (withValue.length < 2) return null;

  const byCategory: Record<string, { value: number; tickers: string[] }> = {};
  let totalValue = 0;

  for (const s of withValue) {
    const price = s.analysis!.priceUSD ?? s.analysis!.price;
    const val   = price * s.quantity!;
    // Prefer DB sector, then static inference, then "Sin clasificar"
    const cat   = s.sector ?? resolveSector(s.ticker) ?? "Sin clasificar";
    if (!byCategory[cat]) byCategory[cat] = { value: 0, tickers: [] };
    byCategory[cat].value   += val;
    byCategory[cat].tickers.push(s.ticker);
    totalValue += val;
  }

  if (totalValue <= 0) return null;

  // Build raw slices
  const rawSlices: SliceData[] = Object.entries(byCategory)
    .map(([label, { value, tickers }]) => ({
      label,
      value,
      pct:     (value / totalValue) * 100,
      color:   sectorColor(label),
      tickers,
    }))
    .sort((a, b) => b.value - a.value);

  // Group < 3% as "Otros"
  const mainSlices = rawSlices.filter((s) => s.pct >= 3);
  const otherSlices = rawSlices.filter((s) => s.pct < 3);

  const slices: SliceData[] = [...mainSlices];
  if (otherSlices.length > 0) {
    const otherValue = otherSlices.reduce((sum, s) => sum + s.value, 0);
    slices.push({
      label:   "Otros",
      value:   otherValue,
      pct:     (otherValue / totalValue) * 100,
      color:   sectorColor("Otros"),
      tickers: otherSlices.flatMap((s) => s.tickers),
    });
  }

  const fmtUSD = (n: number) =>
    n.toLocaleString("es-ES", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div style={{ borderRadius: 12, border: "1px solid var(--card-border)", background: "var(--card-bg)", padding: "12px 16px" }}>
      <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--fg-5)" }}>
        Distribución sectorial
      </p>

      <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <DonutChart slices={slices} />

        <div style={{ flex: 1, minWidth: 160 }}>
          {slices.map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-2)" }}>{s.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-2)" }}>{s.pct.toFixed(1)}%</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "var(--fg-5)" }}>{s.tickers.join(", ")}</span>
                  <span style={{ fontSize: 11, color: "var(--fg-5)" }}>{fmtUSD(s.value)}</span>
                </div>
                <div style={{ marginTop: 2, height: 3, borderRadius: 9999, background: "var(--card-border)" }}>
                  <div style={{ height: "100%", borderRadius: 9999, background: s.color, width: `${s.pct}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
