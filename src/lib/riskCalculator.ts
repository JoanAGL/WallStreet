export type RiskLevel = "Bajo" | "Medio" | "Alto";

/**
 * Calcula el nivel de riesgo informativo basado en indicadores técnicos
 * y el contexto de noticias/escenario. No constituye asesoramiento financiero.
 *
 * Sistema de puntos:
 * - RSI extremo (>70 sobrecompra / <30 sobreventa): +2
 * - RSI zona de precaución (60-70 / 30-40): +1
 * - Escenario Negativo: +2 | Neutral: +1
 * - Sentimiento noticioso Negativo: +1
 */
export function calculateRiskLevel(
  rsi14: number | null,
  scenarioLabel: string,
  newsSentiment: string
): RiskLevel {
  let score = 0;

  if (rsi14 !== null) {
    if (rsi14 > 70 || rsi14 < 30) score += 2;
    else if (rsi14 > 60 || rsi14 < 40) score += 1;
  }

  if (scenarioLabel === "Negativo") score += 2;
  else if (scenarioLabel === "Neutral") score += 1;

  if (newsSentiment === "Negativo") score += 1;

  if (score >= 4) return "Alto";
  if (score >= 2) return "Medio";
  return "Bajo";
}
