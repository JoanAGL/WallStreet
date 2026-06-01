"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const inputStyle: React.CSSProperties = {
  width: "100%", background: "var(--card-inner)", border: "1px solid var(--input-border)",
  borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "var(--fg-2)",
  outline: "none", transition: "border-color .15s",
};
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--fg-4)", marginBottom: 4 };

export default function AddManualSellForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const [ticker,      setTicker]      = useState("");
  const [shares,      setShares]      = useState("");
  const [avgBuyPrice, setAvgBuyPrice] = useState("");
  const [sellPrice,   setSellPrice]   = useState("");
  const [date,        setDate]        = useState("");
  const [notes,       setNotes]       = useState("");
  const [error,       setError]       = useState<string | null>(null);

  const sharesN      = parseFloat(shares);
  const avgBuyN      = parseFloat(avgBuyPrice);
  const sellN        = parseFloat(sellPrice);
  const previewOk    = isFinite(sharesN) && sharesN > 0 && isFinite(avgBuyN) && avgBuyN > 0 && isFinite(sellN) && sellN > 0;
  const invested     = previewOk ? Math.round(sharesN * avgBuyN * 100) / 100 : null;
  const revenue      = previewOk ? Math.round(sharesN * sellN   * 100) / 100 : null;
  const profit       = invested != null && revenue != null ? Math.round((revenue - invested) * 100) / 100 : null;
  const profitPct    = profit != null && invested! > 0 ? Math.round((profit / invested!) * 10000) / 100 : null;
  const fmtUSD = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

  function reset() {
    setTicker(""); setShares(""); setAvgBuyPrice(""); setSellPrice("");
    setDate(""); setNotes(""); setError(null);
  }

  async function handleSubmit() {
    if (!ticker.trim()) { setError("El ticker es obligatorio."); return; }
    if (!previewOk)      { setError("Revisa los valores numéricos."); return; }
    setError(null);

    startTransition(async () => {
      const res = await fetch("/api/portfolio/history/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker:      ticker.trim().toUpperCase(),
          shares:      sharesN,
          avgBuyPrice: avgBuyN,
          sellPrice:   sellN,
          date:        date || null,
          notes:       notes.trim() || null,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "Error al guardar."); return; }
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          width: "100%", padding: "10px 16px", borderRadius: 10, fontSize: 13,
          border: "1px dashed var(--card-border)", background: "transparent",
          color: "var(--fg-4)", cursor: "pointer", transition: "all .15s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--brand-soft)"; (e.currentTarget as HTMLButtonElement).style.color = "#93C5FD"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--card-border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--fg-4)"; }}
      >
        + Añadir venta histórica
      </button>
    );
  }

  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--fg-2)" }}>Nueva venta histórica</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {/* Ticker */}
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Ticker *</label>
          <input
            style={inputStyle} value={ticker} placeholder="Ej: AAPL"
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
          />
        </div>

        {/* Shares */}
        <div>
          <label style={labelStyle}>Acciones *</label>
          <input
            type="number" min="0.001" step="any" style={inputStyle}
            value={shares} placeholder="ej: 10"
            onChange={(e) => setShares(e.target.value)}
          />
        </div>

        {/* Avg buy price */}
        <div>
          <label style={labelStyle}>Precio medio compra * (USD)</label>
          <input
            type="number" min="0.01" step="any" style={inputStyle}
            value={avgBuyPrice} placeholder="ej: 145.00"
            onChange={(e) => setAvgBuyPrice(e.target.value)}
          />
        </div>

        {/* Sell price */}
        <div>
          <label style={labelStyle}>Precio venta * (USD)</label>
          <input
            type="number" min="0.01" step="any" style={inputStyle}
            value={sellPrice} placeholder="ej: 178.00"
            onChange={(e) => setSellPrice(e.target.value)}
          />
        </div>

        {/* Date */}
        <div>
          <label style={labelStyle}>Fecha de venta (opcional)</label>
          <input
            type="date" style={inputStyle} value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {/* Notes */}
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Notas (opcional)</label>
          <input
            type="text" style={inputStyle} value={notes}
            placeholder="Motivo de la venta, contexto…"
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {/* Live preview */}
      {previewOk && invested != null && revenue != null && profit != null && profitPct != null && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {[
            { label: "Invertido",  value: fmtUSD(invested),  color: "var(--fg-2)" },
            { label: "Recaudado",  value: fmtUSD(revenue),   color: "var(--fg-2)" },
            { label: "Profit",     value: (profit >= 0 ? "+" : "") + fmtUSD(profit),  color: profit >= 0 ? "#4ADE80" : "#F87171" },
            { label: "ROI",        value: (profitPct >= 0 ? "+" : "") + profitPct.toFixed(2) + "%", color: profitPct >= 0 ? "#4ADE80" : "#F87171" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "var(--card-inner)", border: "1px solid var(--card-border-inner)", borderRadius: 8, padding: "7px 8px", textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 10, color: "var(--fg-5)", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</p>
              <p style={{ margin: "3px 0 0", fontSize: 13, fontWeight: 600, color }}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p style={{ margin: 0, fontSize: 12, color: "#F87171", background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.35)", borderRadius: 8, padding: "7px 12px" }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => { reset(); setOpen(false); }} disabled={isPending}
          style={{ flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 500, border: "1px solid var(--card-border)", background: "transparent", color: "var(--fg-3)", cursor: "pointer", opacity: isPending ? .5 : 1 }}
        >
          Cancelar
        </button>
        <button
          onClick={handleSubmit} disabled={isPending || !ticker.trim() || !previewOk}
          style={{ flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 500, border: 0, background: "var(--brand)", color: "#fff", cursor: "pointer", opacity: (isPending || !ticker.trim() || !previewOk) ? .5 : 1, transition: "background .15s" }}
        >
          {isPending ? "Guardando…" : "Guardar venta"}
        </button>
      </div>
    </div>
  );
}
