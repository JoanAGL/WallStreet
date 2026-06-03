"use client";

import { useState, useRef, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ImportResult {
  imported:      number;
  skipped:       number;
  stocksCreated: number;
}

export default function ImportPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [dragging,  setDragging]  = useState(false);
  const [file,      setFile]      = useState<File | null>(null);
  const [result,    setResult]    = useState<ImportResult | null>(null);
  const [error,     setError]     = useState<string | null>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.name.endsWith(".csv")) {
      setFile(dropped);
      setResult(null);
      setError(null);
    } else {
      setError("Solo se aceptan archivos CSV exportados de DEGIRO.");
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setResult(null); setError(null); }
  };

  const handleImport = () => {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/portfolio/import/degiro", { method: "POST", body: fd });
      const data = await res.json() as ImportResult & { error?: string };
      if (!res.ok) { setError(data.error ?? "Error desconocido."); return; }
      setResult(data);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  };

  return (
    <div style={{ maxWidth: 580, margin: "0 auto", padding: "32px 16px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--fg-1)" }}>
            Importar desde DEGIRO
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--fg-4)" }}>
            Importa tu historial de transacciones automáticamente
          </p>
        </div>
        <Link
          href="/dashboard"
          style={{ fontSize: 12, color: "var(--link)", textDecoration: "none" }}
        >
          ← Dashboard
        </Link>
      </div>

      {/* Instructions card */}
      <div style={{
        background: "var(--card-bg)", border: "1px solid var(--card-border)",
        borderRadius: 12, padding: 16, marginBottom: 20,
      }}>
        <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: ".05em" }}>
          Cómo exportar tu CSV de DEGIRO
        </p>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--fg-4)", lineHeight: 1.8 }}>
          <li>Accede a DEGIRO → <strong style={{ color: "var(--fg-3)" }}>Actividad</strong> → <strong style={{ color: "var(--fg-3)" }}>Transacciones</strong></li>
          <li>Selecciona el rango de fechas que quieras importar</li>
          <li>Pulsa <strong style={{ color: "var(--fg-3)" }}>Exportar</strong> y descarga el archivo <code style={{ background: "var(--card-inner)", padding: "1px 6px", borderRadius: 4, fontSize: 12 }}>.csv</code></li>
          <li>Arrastra aquí el archivo o usa el selector</li>
        </ol>
      </div>

      {/* Success banner */}
      {result && (
        <div style={{
          display: "flex", gap: 12, alignItems: "flex-start",
          background: "rgba(16,163,74,.12)", border: "1px solid rgba(16,163,74,.35)",
          borderRadius: 12, padding: "14px 16px", marginBottom: 20,
        }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>✓</span>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#4ADE80" }}>
              Importación completada
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--fg-3)", lineHeight: 1.5 }}>
              Se han importado <strong style={{ color: "#4ADE80" }}>{result.imported} transacciones</strong> de DEGIRO
              correctamente y se ha recalculado tu coste medio ponderado (WAC).
              {result.skipped > 0 && ` (${result.skipped} duplicadas omitidas)`}
              {result.stocksCreated > 0 && ` · ${result.stocksCreated} nuevas posiciones creadas`}
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Link href="/dashboard" style={{ fontSize: 12, color: "var(--link)", textDecoration: "none" }}>
                Ver Dashboard →
              </Link>
              <span style={{ color: "var(--fg-5)" }}>·</span>
              <Link href="/dashboard/insights" style={{ fontSize: 12, color: "var(--link)", textDecoration: "none" }}>
                Ver Insights →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !file && fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? "var(--brand-soft)" : file ? "rgba(16,163,74,.5)" : "var(--card-border)"}`,
          borderRadius: 14,
          background: dragging ? "rgba(37,99,235,.06)" : file ? "rgba(16,163,74,.05)" : "var(--card-bg)",
          padding: "40px 24px",
          textAlign: "center",
          cursor: file ? "default" : "pointer",
          transition: "all .2s",
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {!file ? (
          <>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📂</div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--fg-2)" }}>
              Arrastra tu archivo CSV aquí
            </p>
            <p style={{ margin: "6px 0 16px", fontSize: 13, color: "var(--fg-5)" }}>
              o haz clic para seleccionarlo
            </p>
            <span style={{
              display: "inline-block", fontSize: 12, padding: "4px 14px", borderRadius: 9999,
              background: "var(--card-inner)", border: "1px solid var(--card-border-inner)", color: "var(--fg-4)",
            }}>
              Solo archivos .csv de DEGIRO
            </span>
          </>
        ) : (
          <>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#4ADE80" }}>{file.name}</p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--fg-5)" }}>
              {(file.size / 1024).toFixed(1)} KB · Listo para importar
            </p>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          marginTop: 12, padding: "10px 14px", borderRadius: 10,
          background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.35)",
          fontSize: 13, color: "#F87171",
        }}>
          {error}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        {file && (
          <button
            onClick={() => { setFile(null); setError(null); if (fileRef.current) fileRef.current.value = ""; }}
            style={{
              flex: "0 0 auto", padding: "10px 18px", borderRadius: 10, fontSize: 13,
              fontWeight: 500, border: "1px solid var(--card-border)", background: "transparent",
              color: "var(--fg-3)", cursor: "pointer",
            }}
          >
            Quitar archivo
          </button>
        )}
        <button
          onClick={handleImport}
          disabled={!file || isPending}
          style={{
            flex: 1, padding: "11px 0", borderRadius: 10, fontSize: 14, fontWeight: 600,
            border: 0, background: file && !isPending ? "var(--brand)" : "var(--card-inner)",
            color: file && !isPending ? "#fff" : "var(--fg-5)",
            cursor: file && !isPending ? "pointer" : "not-allowed",
            transition: "background .15s",
          }}
        >
          {isPending ? "Importando…" : "Importar transacciones"}
        </button>
      </div>

      {isPending && (
        <p style={{ marginTop: 12, textAlign: "center", fontSize: 12, color: "var(--fg-5)" }}>
          Procesando CSV, calculando WAC y actualizando posiciones…
        </p>
      )}
    </div>
  );
}
