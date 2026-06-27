"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PeerData } from "@/app/api/stock/peers/[ticker]/route";

interface Props {
  ticker: string;
}

function fmtMCap(mc: number | null): string {
  if (mc == null) return "—";
  if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(1)}T`;
  if (mc >= 1_000) return `$${(mc / 1_000).toFixed(1)}B`;
  return `$${mc.toFixed(0)}M`;
}

function fmtX(v: number | null): string {
  if (v == null || !isFinite(v)) return "—";
  return `${v.toFixed(1)}x`;
}

function fmtChg(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export default function PeerComparison({ ticker }: Props) {
  const [peers, setPeers] = useState<PeerData[] | null>(null);

  useEffect(() => {
    fetch(`/api/stock/peers/${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((d) => setPeers(d.peers ?? []))
      .catch(() => setPeers([]));
  }, [ticker]);

  // Need at least 2 peers (including the current ticker itself)
  if (!peers || peers.length < 2) return null;

  return (
    <div style={{
      borderRadius: 12,
      border: "1px solid var(--card-border)",
      background: "var(--card-bg)",
      padding: "12px 16px",
    }}>
      <p style={{
        margin: "0 0 10px",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: ".05em",
        textTransform: "uppercase",
        color: "var(--fg-5)",
      }}>
        Empresas comparables
      </p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {["Ticker", "Precio", "Hoy", "Market Cap", "P/E", "EV/EBITDA", "P/S"].map((col) => (
                <th
                  key={col}
                  style={{
                    textAlign: "left",
                    padding: "4px 10px",
                    color: "var(--fg-5)",
                    fontWeight: 600,
                    fontSize: 11,
                    borderBottom: "1px solid var(--card-border)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {peers.map((p) => {
              const isCurrent = p.ticker === ticker;
              const chgColor = (p.changePercent ?? 0) >= 0 ? "#4ade80" : "#f87171";

              return (
                <tr
                  key={p.ticker}
                  style={{
                    background: isCurrent ? "rgba(59,130,246,.07)" : undefined,
                  }}
                >
                  <td style={{ padding: "7px 10px", borderBottom: "1px solid var(--card-border-inner)" }}>
                    <Link
                      href={`/dashboard/${p.ticker}`}
                      style={{
                        fontWeight: isCurrent ? 700 : 500,
                        color: isCurrent ? "var(--accent, #3b82f6)" : "var(--fg-2)",
                        textDecoration: "none",
                        letterSpacing: isCurrent ? ".02em" : undefined,
                      }}
                    >
                      {p.ticker}
                    </Link>
                  </td>
                  <td style={{ padding: "7px 10px", borderBottom: "1px solid var(--card-border-inner)", color: "var(--fg-2)", fontWeight: 500 }}>
                    {p.price != null ? `$${p.price.toFixed(2)}` : "—"}
                  </td>
                  <td style={{ padding: "7px 10px", borderBottom: "1px solid var(--card-border-inner)", color: chgColor, fontWeight: 500 }}>
                    {fmtChg(p.changePercent)}
                  </td>
                  <td style={{ padding: "7px 10px", borderBottom: "1px solid var(--card-border-inner)", color: "var(--fg-3)" }}>
                    {fmtMCap(p.marketCap)}
                  </td>
                  <td style={{ padding: "7px 10px", borderBottom: "1px solid var(--card-border-inner)", color: "var(--fg-3)" }}>
                    {fmtX(p.pe)}
                  </td>
                  <td style={{ padding: "7px 10px", borderBottom: "1px solid var(--card-border-inner)", color: "var(--fg-3)" }}>
                    {fmtX(p.evEbitda)}
                  </td>
                  <td style={{ padding: "7px 10px", borderBottom: "1px solid var(--card-border-inner)", color: "var(--fg-3)" }}>
                    {fmtX(p.ps)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 10, color: "var(--fg-5)", fontStyle: "italic" }}>
        Precio en tiempo real · ratios de valoración con un día de retraso
      </p>
    </div>
  );
}
