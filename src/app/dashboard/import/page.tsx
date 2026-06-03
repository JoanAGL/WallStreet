"use client";

import { useState, useRef, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ImportResult {
  imported:      number;
  skipped:       number;
  stocksCreated: number;
  isinsFailed:   string[];
}

export default function ImportPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging]   = useState(false);
  const [file,     setFile]       = useState<File | null>(null);
  const [result,   setResult]     = useState<ImportResult | null>(null);
  const [error,    setError]      = useState<string | null>(null);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".csv")) { setError("Solo se aceptan archivos .csv de DEGIRO."); return; }
    setFile(f); setResult(null); setError(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    pick(e.dataTransfer.files[0]);
  }, []);

  const handleImport = () => {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch("/api/portfolio/import/degiro", { method: "POST", body: fd });
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

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--fg-1)" }}>
            Importar desde DEGIRO
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--fg-4)" }}>
            Los tickers se resuelven automáticamente vía Yahoo Finance usando el ISIN
          </p>
        </div>
        <Link href="/dashboard" style={{ fontSize: 12, color: "var(--link)", textDecoration: "none" }}>
          &larr; Dashboard
        </Link>
      </div>

      {/* How-to */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: ".05em" }}>
          Cómo exportar tu CSV de DEGIRO
        </p>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--fg-4)", lineHeight: 1.9 }}>
          <li>DEGIRO &rarr; <strong style={{ color: "var(--fg-3)" }}>Actividad</strong> &rarr; <strong style={{ color: "var(--fg-3)" }}>Transacciones</strong></li>
          <li>Selecciona el rango de fechas completo</li>
          <li>Pulsa <strong style={{ color: "var(--fg-3)" }}>Exportar</strong> y descarga el <code style={{ background: "var(--card-inner)", padding: "1px 6px", borderRadius: 4, fontSize: 12 }}>.csv</code></li>
          <li>Arrastra el archivo aquí o usa el selector</li>
        </ol>
      </div>

      {/* Success */}
      {result && (
        <div style={{ display: "flex", gap: 12, background: "rgba(16,163,74,.12)", border: "1px solid rgba(16,163,74,.35)", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>&#10003;</span>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#4ADE80" }}>
              Importación completada
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--fg-3)", lineHeight: 1.5 }}>
              <strong style={{ color: "#4ADE80" }}>{result.imported} transacciones</strong> importadas
              correctamente con el WAC recalculado.
              {result.skipped > 0 && ` ${result.skipped} duplicadas omitidas.`}
              {result.stocksCreated > 0 && ` ${result.stocksCreated} nuevas posiciones creadas.`}
            </p>
            {result.isinsFailed.length > 0 && (
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--fg-5)" }}>
                ISINs no resueltos por Yahoo Finance (importados sin ticker): {result.isinsFailed.join(", ")}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Link href="/dashboard" style={{ fontSize: 12, color: "var(--link)", textDecoration: "none" }}>Ver Dashboard &rarr;</Link>
              <span style={{ color: "var(--fg-5)" }}>·</span>
              <Link href="/dashboard/insights" style={{ fontSize: 12, color: "var(--link)", textDecoration: "none" }}>Ver Insights &rarr;</Link>
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
          borderRadius: 14, background: dragging ? "rgba(37,99,235,.06)" : file ? "rgba(16,163,74,.05)" : "var(--card-bg)",
          padding: "40px 24px", textAlign: "center", cursor: file ? "default" : "pointer", transition: "all .2s",
        }}
      >
        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }}
          onChange={(e) => pick(e.target.files?.[0])} />

        {!file ? (
          <>
            <div style={{ fontSize: 36, marginBottom: 12 }}>&#128194;</div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--fg-2)" }}>
              Arrastra tu archivo CSV aquí
            </p>
            <p style={{ margin: "6px 0 16px", fontSize: 13, color: "var(--fg-5)" }}>
              o haz clic para seleccionarlo
            </p>
            <span style={{ display: "inline-block", fontSize: 12, padding: "4px 14px", borderRadius: 9999, background: "var(--card-inner)", border: "1px solid var(--card-border-inner)", color: "var(--fg-4)" }}>
              Solo archivos .csv de DEGIRO
            </span>
          </>
        ) : (
          <>
            <div style={{ fontSize: 32, marginBottom: 8 }}>&#128196;</div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#4ADE80" }}>{file.name}</p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--fg-5)" }}>
              {(file.size / 1024).toFixed(1)} KB &middot; Listo para importar
            </p>
          </>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.35)", fontSize: 13, color: "#F87171" }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        {file && (
          <button onClick={() => { setFile(null); setError(null); if (fileRef.current) fileRef.current.value = ""; }}
            style={{ flex: "0 0 auto", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 500, border: "1px solid var(--card-border)", background: "transparent", color: "var(--fg-3)", cursor: "pointer" }}>
            Quitar archivo
          </button>
        )}
        <button onClick={handleImport} disabled={!file || isPending}
          style={{ flex: 1, padding: "11px 0", borderRadius: 10, fontSize: 14, fontWeight: 600, border: 0, background: file && !isPending ? "var(--brand)" : "var(--card-inner)", color: file && !isPending ? "#fff" : "var(--fg-5)", cursor: file && !isPending ? "pointer" : "not-allowed", transition: "background .15s" }}>
          {isPending ? "Importando y resolviendo tickers…" : "Importar transacciones"}
        </button>
      </div>

      {isPending && (
        <p style={{ marginTop: 10, textAlign: "center", fontSize: 12, color: "var(--fg-5)" }}>
          Consultando Yahoo Finance por ISIN, calculando WAC… puede tardar unos segundos.
        </p>
      )}
    </div>
  );
}
