"use client";

import { useState } from "react";
import StockCard from "@/components/dashboard/StockCard";
import type { StockWithAnalysis } from "@/repositories/stockRepository";

interface Props {
  stocks: StockWithAnalysis[];
}

export default function ClosedStocksSection({ stocks }: Props) {
  const [open, setOpen] = useState(false);

  if (stocks.length === 0) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          background: "var(--card-bg)", border: "1px solid var(--card-border)",
          borderRadius: open ? "12px 12px 0 0" : 12,
          padding: "10px 16px", cursor: "pointer", transition: "border-radius .2s",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-3)", flex: 1, textAlign: "left" }}>
          Posiciones cerradas ({stocks.length})
        </span>
        <span style={{ fontSize: 11, color: "var(--fg-5)" }}>
          {open ? "Ocultar ▲" : "Mostrar ▼"}
        </span>
      </button>

      {open && (
        <div
          style={{
            border: "1px solid var(--card-border)", borderTop: 0,
            borderRadius: "0 0 12px 12px", padding: 12,
            background: "var(--background)",
            display: "grid", gap: 12,
          }}
          className="sm:grid-cols-1 lg:grid-cols-2"
        >
          <p style={{ gridColumn: "1 / -1", margin: "0 0 4px", fontSize: 12, color: "var(--fg-5)" }}>
            Estas posiciones tienen saldo cero — aparecen por transacciones históricas importadas.
            Se actualizan con el botón &quot;Actualizar&quot; igual que las activas.
          </p>
          {stocks.map((stock) => (
            <div key={stock.id} style={{ position: "relative" }}>
              <span style={{
                position: "absolute", top: 10, right: 10, zIndex: 10,
                fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 9999,
                background: "var(--card-inner)", border: "1px solid var(--card-border)",
                color: "var(--fg-5)", textTransform: "uppercase", letterSpacing: ".04em",
              }}>
                Cerrada
              </span>
              <StockCard stock={stock} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
