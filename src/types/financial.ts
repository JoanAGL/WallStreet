export type GuidanceSentiment = "EXPANSIVO" | "PRUDENTE" | "CONTRACTIVO";

export type EpsGuidanceStatus = "UPWARD" | "DOWNWARD" | "STABLE";

export interface EarningsGuidanceInsight {
  /** Trimestre fiscal de referencia, e.g. "Q2 2025" */
  fiscalQuarter: string;
  /** Tono general del guidance emitido por la directiva */
  sentiment: GuidanceSentiment;
  /** Crecimiento de ingresos guiado YoY en %, o null si no declarado */
  revenueGuidanceYoY: number | null;
  /** Dirección del guidance de BPA respecto al consenso previo */
  epsGuidanceStatus: EpsGuidanceStatus;
  /** Frases representativas del tono de la directiva (máx. 3) */
  keyCeoQuotes: string[];
  /** Justificación del impacto macro sobre el guidance */
  macroImpactJustification: string;
}
