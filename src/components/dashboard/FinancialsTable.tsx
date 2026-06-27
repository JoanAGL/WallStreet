"use client";

import { useState, useEffect } from "react";
import type { FinancialsTableData, FinancialRow, ValuationRow } from "@/app/api/stock/financials-table/route";

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtAbsolute(n: number | null): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3)  return `${sign}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${abs.toFixed(2)}`;
}

function fmtPct(n: number | null, decimals = 1): string {
  if (n == null) return "";
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}%`;
}

function fmtMult(n: number | null): string {
  if (n == null) return "—";
  return `${n.toFixed(1)}x`;
}

function fmtEps(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function yoyColor(n: number | null): string {
  if (n == null) return "color:var(--fg-5)";
  return n >= 0 ? "color:#4ADE80" : "color:#F87171";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function THead({ cols }: { cols: Array<{ year: number; period: "A" | "E" }> }) {
  return (
    <thead>
      <tr>
        <th style={{ ...cellStyle, textAlign: "left", width: 160, fontSize: 11, color: "var(--fg-5)" }}>Métrica</th>
        {cols.map((c) => (
          <th key={`${c.year}-${c.period}`} style={{
            ...cellStyle,
            background: c.period === "E" ? "rgba(99,102,241,.08)" : "transparent",
            fontSize: 11,
            fontWeight: 600,
            color: c.period === "E" ? "#818CF8" : "var(--fg-3)",
          }}>
            FY {c.year}{c.period}
          </th>
        ))}
      </tr>
    </thead>
  );
}

interface MetricRowProps {
  label:    string;
  sublabel?: string;
  values:   Array<number | null>;
  format:   (n: number | null) => string;
  yoy?:     Array<number | null>;
  margins?: Array<number | null>;
  periods:  Array<"A" | "E">;
}

function MetricRow({ label, sublabel, values, format, yoy, margins, periods }: MetricRowProps) {
  return (
    <tr style={{ borderTop: "1px solid var(--card-border)" }}>
      <td style={{ ...cellStyle, textAlign: "left", color: "var(--fg-2)", fontWeight: 500, fontSize: 12 }}>
        {label}
        {sublabel && <span style={{ display: "block", fontSize: 10, color: "var(--fg-5)", fontWeight: 400 }}>{sublabel}</span>}
      </td>
      {values.map((v, i) => (
        <td key={i} style={{
          ...cellStyle,
          background: periods[i] === "E" ? "rgba(99,102,241,.05)" : "transparent",
          verticalAlign: "top",
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-1)" }}>{format(v)}</span>
          {margins?.[i] != null && (
            <span style={{ display: "block", fontSize: 10, color: "var(--fg-5)" }}>
              {margins[i]!.toFixed(1)}%
            </span>
          )}
          {yoy?.[i] != null && (
            <span style={{ display: "block", fontSize: 10, style: yoyColor(yoy[i]) } as React.CSSProperties}>
              <span style={{ color: (yoy[i] ?? 0) >= 0 ? "#4ADE80" : "#F87171" }}>{fmtPct(yoy[i])}</span>
            </span>
          )}
        </td>
      ))}
    </tr>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={99} style={{ ...cellStyle, textAlign: "left", fontSize: 10, fontWeight: 700,
        letterSpacing: ".06em", textTransform: "uppercase", color: "var(--fg-5)",
        background: "rgba(0,0,0,.03)", paddingTop: 8, paddingBottom: 8 }}>
        {label}
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const cellStyle: React.CSSProperties = {
  padding: "7px 10px",
  textAlign: "right",
  whiteSpace: "nowrap",
};

export default function FinancialsTable({ ticker }: { ticker: string }) {
  const [data,    setData]    = useState<FinancialsTableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stock/financials-table?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((d: FinancialsTableData & { error?: string }) => {
        if (d.error) { setError(d.error); return; }
        setData(d);
      })
      .catch(() => setError("Error al cargar los datos financieros."))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading) {
    return (
      <div style={{ borderRadius: 12, border: "1px solid var(--card-border)", background: "var(--card-bg)", padding: "16px", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "var(--fg-5)" }}>Cargando tabla financiera…</p>
      </div>
    );
  }

  if (error || !data || data.rows.length === 0) return null;

  const { rows, valuations } = data;
  const cols = rows.map((r) => ({ year: r.year, period: r.period }));
  const get  = <K extends keyof FinancialRow>(key: K) => rows.map((r) => r[key] as number | null);
  const getV = <K extends keyof ValuationRow>(key: K) => valuations.map((r) => r[key] as number | null);

  const hasFmpData = rows.some((r) => r.period === "E" && r.revenue != null);

  return (
    <div style={{ borderRadius: 12, border: "1px solid var(--card-border)", background: "var(--card-bg)", padding: "12px 16px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--fg-5)" }}>
          Actuals &amp; Consensus Estimates
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {data.marketCap != null && (
            <Chip label="Market Cap" value={fmtAbsolute(data.marketCap * 1e6)} />
          )}
          {data.ev != null && (
            <Chip label="EV" value={fmtAbsolute(data.ev * 1e6)} />
          )}
          {data.trailingPE != null && (
            <Chip label="PER trailing" value={`${data.trailingPE.toFixed(1)}x`} />
          )}
          {data.forwardPE != null && (
            <Chip label="PER forward" value={`${data.forwardPE.toFixed(1)}x`} />
          )}
          {data.nextEarningsDate && (
            <Chip label="Próx. earnings" value={data.nextEarningsDate} accent />
          )}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <THead cols={cols} />
          <tbody>
            <SectionHeader label="Cuenta de resultados" />

            <MetricRow
              label="Revenue"
              values={get("revenue")}
              format={fmtAbsolute}
              yoy={get("revenueYoY")}
              periods={rows.map((r) => r.period)}
            />

            <MetricRow
              label="Gross Profit"
              sublabel="Gross Margin"
              values={get("grossProfit")}
              format={fmtAbsolute}
              margins={get("grossMargin")}
              periods={rows.map((r) => r.period)}
            />

            <MetricRow
              label="EBITDA Adj."
              sublabel="EBITDA Margin"
              values={get("ebitda")}
              format={fmtAbsolute}
              yoy={get("ebitdaYoY")}
              margins={get("ebitdaMargin")}
              periods={rows.map((r) => r.period)}
            />

            <MetricRow
              label="EBIT Adj."
              sublabel="EBIT Margin"
              values={get("ebit")}
              format={fmtAbsolute}
              yoy={get("ebitYoY")}
              margins={get("ebitMargin")}
              periods={rows.map((r) => r.period)}
            />

            <MetricRow
              label="Net Income Adj."
              sublabel="Net Margin"
              values={get("netIncome")}
              format={fmtAbsolute}
              yoy={get("netIncomeYoY")}
              margins={get("netMargin")}
              periods={rows.map((r) => r.period)}
            />

            <MetricRow
              label="EPS Adj. (diluted)"
              values={get("eps")}
              format={fmtEps}
              yoy={get("epsYoY")}
              periods={rows.map((r) => r.period)}
            />

            <SectionHeader label="Valoración" />

            <MetricRow label="EV / EBITDA"  values={getV("evEbitda")}  format={fmtMult} periods={rows.map((r) => r.period)} />
            <MetricRow label="EV / EBIT"    values={getV("evEbit")}    format={fmtMult} periods={rows.map((r) => r.period)} />
            <MetricRow label="P/E forward"  values={getV("peForward")} format={fmtMult} periods={rows.map((r) => r.period)} />
            <MetricRow label="P/Sales fwd"  values={getV("psForward")} format={fmtMult} periods={rows.map((r) => r.period)} />
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 8, fontSize: 10, color: "var(--fg-5)" }}>
        A = Dato real · E = Estimación consenso analistas
        {!hasFmpData && " · Estimaciones no disponibles (FMP_API_KEY no configurada)"}
        {" "}· Fuentes: Finnhub, Financial Modeling Prep
      </p>
    </div>
  );
}

function Chip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span style={{
      display: "inline-flex",
      gap: 4,
      alignItems: "baseline",
      padding: "2px 8px",
      borderRadius: 9999,
      fontSize: 11,
      border: `1px solid ${accent ? "rgba(99,102,241,.4)" : "var(--card-border)"}`,
      background: accent ? "rgba(99,102,241,.08)" : "transparent",
      color: "var(--fg-3)",
    }}>
      <span style={{ color: "var(--fg-5)", fontWeight: 400 }}>{label}</span>
      <span style={{ fontWeight: 600, color: accent ? "#818CF8" : "var(--fg-2)" }}>{value}</span>
    </span>
  );
}
