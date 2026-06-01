import Link from "next/link";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
    <h2 className="font-semibold text-gray-900">{title}</h2>
    <div className="text-sm text-gray-600 space-y-2">{children}</div>
  </section>
);

export default function HelpPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
          ← Dashboard
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">¿Cómo funciona?</h1>
      </div>

      <Section title="Añadir acciones">
        <p>Puedes añadir hasta <strong>20 acciones</strong> de los mercados NYSE y NASDAQ. Escribe el ticker (símbolo bursátil) en el campo de búsqueda: aparecerán sugerencias automáticas.</p>
        <p>El sistema verifica que el ticker exista antes de añadirlo. Ejemplos válidos: <code className="bg-gray-100 px-1 rounded">AAPL</code>, <code className="bg-gray-100 px-1 rounded">MSFT</code>, <code className="bg-gray-100 px-1 rounded">BRK.B</code>.</p>
      </Section>

      <Section title="Horizontes de inversión">
        <p>Cada acción puede configurarse con un horizonte distinto. El horizonte determina qué métricas y análisis se priorizan:</p>
        <ul className="space-y-1 list-disc list-inside">
          <li><strong>Corto plazo</strong> — análisis técnico: SMA20, SMA50, RSI14, ATR, volumen relativo.</li>
          <li><strong>Medio plazo</strong> — fundamentales de crecimiento: PEG ratio, EPS forward, ROE, deuda/equity.</li>
          <li><strong>Largo plazo</strong> — valor y dividendos: P/E trailing, FCF yield, margen de beneficio, beta.</li>
        </ul>
        <p>La IA genera un escenario para los tres horizontes simultáneamente; puedes cambiar la vista con el selector en cada tarjeta.</p>
      </Section>

      <Section title="Escenarios de la IA">
        <p>Gemini analiza los indicadores técnicos, fundamentales y las noticias de las últimas 48h para clasificar cada acción en:</p>
        <ul className="space-y-1 list-disc list-inside">
          <li><span className="text-green-700 font-medium">Positivo</span> — contexto favorable para el horizonte elegido.</li>
          <li><span className="text-yellow-700 font-medium">Neutral</span> — señales mixtas sin tendencia clara.</li>
          <li><span className="text-red-700 font-medium">Negativo</span> — contexto desfavorable o riesgo elevado.</li>
        </ul>
        <p>La <strong>alerta de divergencia</strong> aparece cuando el análisis técnico y el fundamental apuntan en direcciones opuestas.</p>
      </Section>

      <Section title="Mi posición (P&L)">
        <p>Si introduces tu precio de compra, cantidad y fecha en cada tarjeta, el sistema calcula:</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>Ganancia / pérdida en valor absoluto y en porcentaje.</li>
          <li>P&L total agregado de toda la cartera en el resumen superior.</li>
        </ul>
        <p>Estos datos son opcionales y se guardan de forma privada en tu cuenta.</p>
      </Section>

      <Section title="Resumen de cartera">
        <p>Cuando tienes 2 o más acciones con análisis, aparece el panel <strong>Resumen de cartera</strong> con:</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>Distribución de escenarios (Positivos / Neutrales / Negativos).</li>
          <li>Variación media diaria del conjunto.</li>
          <li>Número de divergencias detectadas.</li>
          <li>P&L total si has introducido datos de compra.</li>
        </ul>
      </Section>

      <Section title="Análisis global de cartera (IA)">
        <p>La IA también analiza tu cartera de forma conjunta y genera:</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>Score de diversificación sectorial.</li>
          <li>Perfil de riesgo agregado.</li>
          <li>Sugerencias de rebalanceo (solo informativas).</li>
        </ul>
      </Section>

      <Section title="Historial de análisis">
        <p>Haz clic en el nombre del ticker para ver su historial: cada actualización guarda un snapshot con precio, escenario, RSI y horizonte. Se conservan los últimos 30 registros con un gráfico de evolución de precio.</p>
      </Section>

      <Section title="Actualización de datos">
        <p>Los datos se actualizan <strong>automáticamente cada día laborable a las 08:00 UTC</strong> (antes de la apertura de Wall Street).</p>
        <p>Puedes forzar una actualización manual con el botón «Actualizar datos». Hay un límite de <strong>una actualización completa cada 4 horas</strong> para evitar exceder los límites de las APIs gratuitas.</p>
      </Section>

      <Section title="Aviso legal">
        <p className="font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Los análisis generados son <strong>meramente informativos y educativos</strong>. No constituyen asesoramiento financiero. No se recomienda comprar, vender ni mantener ningún activo basándose exclusivamente en esta información.
        </p>
      </Section>
    </div>
  );
}
