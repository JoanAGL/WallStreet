// Shared deterministic test fixtures — used by both Vitest integration tests
// and Playwright E2E tests to ensure consistent contract validation.

export const MOCK_TICKER = "AAPL";
export const MOCK_PRICE = 185.5;
export const MOCK_CHANGE_PCT = 1.23;

export const MOCK_QUOTE = {
  ticker: MOCK_TICKER,
  price: MOCK_PRICE,
  changePercent: MOCK_CHANGE_PCT,
  currency: "USD",
};

// 60 newest-first prices for AAPL with realistic noise
export const MOCK_HISTORICAL_CLOSES: number[] = Array.from(
  { length: 60 },
  (_, i) => 185.5 * (1 + 0.001 * (30 - i) + 0.02 * Math.sin(i * 1.7))
);

export const MOCK_NEWS_ARTICLES = [
  {
    title: "Apple Reports Record Q4 Earnings",
    description: "Apple Inc exceeded analyst expectations with strong iPhone sales.",
    url: "https://example.com/news/1",
    publishedAt: new Date().toISOString(),
    source: { name: "Reuters" },
  },
  {
    title: "Apple Vision Pro Demand Surpasses Projections",
    description: "Spatial computing headset sees strong early adoption.",
    url: "https://example.com/news/2",
    publishedAt: new Date().toISOString(),
    source: { name: "Bloomberg" },
  },
];

// Minimal valid AllHorizonsAIAnalysis JSON — matches Zod schema in aiAnalysisService
export const MOCK_ALL_HORIZONS_RESPONSE = {
  shortTerm: {
    analysisText: "AAPL muestra momentum positivo con RSI en zona neutral.",
    scenarioLabel: "Positivo",
    scenarioJustification: "Técnicos alineados con sentimiento noticioso.",
    divergenceAlert: false,
    horizonMatch: "Activo adecuado para trading de corto plazo.",
    keyMetrics: ["RSI(14): 55.2", "SMA20: $183.1", "Vol relativo: 1.2x"],
    portfolioAlert: "",
    prescriptiveAction: {
      action: "MANTENER",
      confidenceScore: 65,
      executionPriceLimit: 183.0,
      quantitativeJustification: "RSI neutral sin señal de entrada clara.",
      estimatedHorizonDays: 15,
    },
  },
  mediumTerm: {
    analysisText: "Fundamentos sólidos con crecimiento de ingresos sostenido.",
    scenarioLabel: "Positivo",
    scenarioJustification: "Revenue guidance EXPANSIVO respaldado por márgenes.",
    divergenceAlert: false,
    horizonMatch: "Adecuado para cartera de medio plazo.",
    keyMetrics: ["Revenue Growth YoY: 6.1%", "PEG: 2.1", "ROE: 31%"],
    portfolioAlert: "",
    prescriptiveAction: {
      action: "COMPRA",
      confidenceScore: 72,
      executionPriceLimit: 180.0,
      quantitativeJustification: "Sharpe positivo con guidance expansivo.",
      estimatedHorizonDays: 180,
    },
  },
  longTerm: {
    analysisText: "Moat tecnológico y generación de FCF lo posicionan como activo de largo plazo.",
    scenarioLabel: "Positivo",
    scenarioJustification: "Ecosistema robusto y dividendos crecientes.",
    divergenceAlert: false,
    horizonMatch: "Excelente candidato para carteras de largo plazo.",
    keyMetrics: ["FCF Yield: 4.2%", "Dividend Yield: 0.6%", "Beta: 1.2"],
    portfolioAlert: "",
    prescriptiveAction: {
      action: "COMPRA",
      confidenceScore: 80,
      executionPriceLimit: 175.0,
      quantitativeJustification: "FCF yield atractivo con moat consolidado.",
      estimatedHorizonDays: 730,
    },
  },
};

export const MOCK_NEWS_ANALYSIS_RESPONSE = {
  summary: "Positivo",
  sentiment: "Positivo",
};

// Minimal Prisma user for session mocking
export const MOCK_USER = {
  id: "test-user-id-001",
  email: "test@wallstreet.dev",
  name: "Test User",
};

export const MOCK_STOCK = {
  id: "stock-id-aapl",
  ticker: "AAPL",
  userId: MOCK_USER.id,
  investmentHorizon: "SHORT_TERM" as const,
  purchasePrice: 170.0,
  quantity: 10,
  purchaseDate: new Date("2024-01-15"),
  createdAt: new Date(),
};
