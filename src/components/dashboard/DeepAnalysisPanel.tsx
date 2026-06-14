"use client";

import { useState } from "react";

interface AnalysisResult {
  analysis: string;
  generatedAt: string;
}

function renderAnalysis(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (line.startsWith("**") && line.endsWith("**")) {
      return (
        <p key={i} style={{ margin: "12px 0 4px", fontWeight: 700, fontSize: 13, color: "var(--fg-1)" }}>
          {line.replace(/\*\*/g, "")}
        </p>
      );
    }
    if (line.startsWith("**") && line.includes(":**")) {
      const parts = line.split(":**");
      return (
        <p key={i} style={{ margin: "12px 0 4px", fontWeight: 700, fontSize: 13, color: "var(--fg-1)" }}>
          {parts[0].replace(/\*\*/g, "")}:
          <span style={{ fontWeight: 400, color: "var(--fg-2)" }}>{parts[1]}</span>
        </p>
      );
    }
    if (line.startsWith("- ") || line.startsWith("• ")) {
      return (
        <p key={i} style={{ margin: "2px 0", paddingLeft: 14, fontSize: 13, color: "var(--fg-3)", lineHeight: 1.6 }}>
          {line}
        </p>
      );
    }
    if (line.trim() === "") return <div key={i} style={{ height: 4 }} />;
    return (
      <p key={i} style={{ margin: "2px 0", fontSize: 13, color: "var(--fg-3)", lineHeight: 1.6 }}>
        {line}
      </p>
    );
  });
}

export default function DeepAnalysisPanel() {
  const [result, setResult]   = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [open, setOpen]       = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    setOpen(true);
    try {
      const res  = await fetch("/api/portfolio/deep-analysis", { method: "POST" });
      const data = await res.json() as { analysis?: string; generatedAt?: string; error?: string };
      if (data.error) { setError(data.error); return; }
      setResult({ analysis: data.analysis!, generatedAt: data.generatedAt! });
    } catch {
      setError("Error al conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ borderRadius: 12, border: "1px solid var(--card-border)", background: "var(--card-bg)", padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--fg-1)" }}>
            Analiza con IA
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "var(--fg-5)" }}>
            Análisis profundo del portfolio: P&L, riesgo, tax harvesting y recomendaciones
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          style={{
            padding: "7px 16px",
            borderRadius: 8,
            background: loading ? "var(--card-border)" : "var(--accent)",
            color: "#fff",
            border: "none",
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {loading ? (
            <>
              <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", animation: "spin 0.8s linear infinite" }} />
              Analizando…
            </>
          ) : (
            "✨ Analizar portfolio"
          )}
        </button>
      </div>

      {error && (
        <p style={{ marginTop: 10, fontSize: 12, color: "#F87171" }}>{error}</p>
      )}

      {open && result && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--card-border)" }}>
          <div>{renderAnalysis(result.analysis)}</div>
          <p style={{ marginTop: 10, fontSize: 11, color: "var(--fg-5)", borderTop: "1px solid var(--card-border)", paddingTop: 6 }}>
            Generado el {new Date(result.generatedAt).toLocaleString("es-ES")} · Análisis puramente informativo, no asesoramiento financiero.
          </p>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
