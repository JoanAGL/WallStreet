export type UpdateType = "price" | "news" | "technicals" | "ai" | "portfolio";

export const UPDATE_TYPE_LABELS: Record<UpdateType, string> = {
  price:      "Precio",
  news:       "Noticias",
  technicals: "Datos técnicos",
  ai:         "Análisis IA completo",
  portfolio:  "Análisis global de cartera",
};

export const UPDATE_TYPE_DESCRIPTIONS: Record<UpdateType, string> = {
  price:      "Cotización y variación del día",
  news:       "Resumen y sentimiento noticioso",
  technicals: "SMA, RSI, ATR y volumen relativo",
  ai:         "Análisis de los 3 horizontes con Gemini",
  portfolio:  "Evaluación global de la cartera",
};

// TTL en ms para el check de caché de cada tipo
export const UPDATE_TYPE_TTL_MS: Record<UpdateType, number> = {
  price:      15 * 60 * 1000,          //  15 min
  technicals: 60 * 60 * 1000,          //   1 h
  news:       2  * 60 * 60 * 1000,     //   2 h
  ai:         4  * 60 * 60 * 1000,     //   4 h
  portfolio:  4  * 60 * 60 * 1000,     //   4 h
};

export const STOCK_UPDATE_TYPES: UpdateType[] = ["price", "news", "technicals", "ai"];
export const ALL_UPDATE_TYPES:   UpdateType[] = ["price", "news", "technicals", "ai", "portfolio"];
