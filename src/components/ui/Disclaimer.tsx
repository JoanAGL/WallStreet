export default function Disclaimer() {
  return (
    <div
      role="note"
      aria-label="Exención de responsabilidad legal"
      style={{
        display: "flex", gap: 8, fontSize: 12, color: "var(--fg-4)",
        background: "var(--card-inner)", border: "1px solid var(--card-border)",
        borderRadius: 8, padding: "9px 12px", lineHeight: 1.5,
      }}
    >
      <span style={{ flexShrink: 0 }}>ℹ</span>
      <span>
        Uso académico e informativo. Los análisis, señales y proyecciones generados por IA son meramente informativos y{" "}
        <strong style={{ color: "var(--fg-3)" }}>no constituyen asesoramiento financiero</strong>.
        Consulta siempre a un profesional financiero regulado antes de tomar cualquier decisión de inversión.
      </span>
    </div>
  );
}
