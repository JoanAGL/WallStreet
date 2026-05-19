export default function Disclaimer() {
  return (
    <div
      role="note"
      aria-label="Exención de responsabilidad legal"
      className="w-full bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800 space-y-1"
    >
      <p>
        <strong>⚠ Aviso legal:</strong>{" "}
        My Personal Advisor es una plataforma de análisis cuantitativo automatizado basado en
        Inteligencia Artificial. Las señales de COMPRA/VENTA/MANTENER/REDUCIR son{" "}
        <strong>proyecciones algorítmicas informativas</strong> basadas en datos históricos y de
        mercado, y no constituyen un contrato de asesoramiento financiero personalizado ni una
        incitación directa a la inversión.{" "}
        <strong>El usuario opera bajo su propio riesgo y responsabilidad.</strong>
      </p>
      <p className="text-amber-700">
        Consulta siempre a un profesional financiero regulado antes de tomar cualquier decisión de inversión.
      </p>
    </div>
  );
}
