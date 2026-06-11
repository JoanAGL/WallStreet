import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/finnhubClient", () => ({
  fetchQuote: vi.fn(),
}));
vi.mock("@/lib/yahooFinanceClient", () => ({
  fetchYahooCandles: vi.fn(),
  fetchFxToUSD: vi.fn().mockImplementation(async (cur: string) => {
    const rates: Record<string, number> = { USD: 1, EUR: 1.1, DKK: 0.155 };
    return rates[cur] ?? null;
  }),
}));

import { getCurrentQuote } from "@/services/marketDataService";
import { fetchQuote } from "@/lib/finnhubClient";

function yahooChartResponse(price: number, currency = "EUR") {
  return {
    ok: true,
    json: async () => ({
      chart: {
        result: [{
          meta: {
            currency,
            regularMarketPrice: price,
            previousClose: price - 0.1,
            chartPreviousClose: price - 0.1,
          },
          indicators: { quote: [{ close: [price] }] },
        }],
        error: null,
      },
    }),
  } as unknown as Response;
}

describe("getCurrentQuote — fallback Finnhub → Yahoo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("usa Yahoo cuando Finnhub LANZA excepción (403 en acciones europeas — caso SAB.MC)", async () => {
    vi.mocked(fetchQuote).mockRejectedValue(new Error("Finnhub quote error 403: no access"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(yahooChartResponse(3.26, "EUR")));

    const q = await getCurrentQuote("SAB.MC");
    expect(q.price).toBeCloseTo(3.26, 2);
    expect(q.currency).toBe("EUR");
    expect(q.priceUSD).toBeCloseTo(3.26 * 1.1, 2);
  });

  it("usa Yahoo cuando Finnhub responde OK con precio 0", async () => {
    vi.mocked(fetchQuote).mockResolvedValue({ c: 0, d: 0, dp: 0, h: 0, l: 0, o: 0, pc: 0, t: 0 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(yahooChartResponse(270, "DKK")));

    const q = await getCurrentQuote("NOVO-B.CO");
    expect(q.price).toBe(270);
    expect(q.currency).toBe("DKK");
    // FX de la divisa REAL (DKK→USD ≈ 0.155), no EURUSD: 270 DKK ≈ $41.85,
    // no los ~$297 que salían aplicando 1.10
    expect(q.priceUSD).toBeCloseTo(270 * 0.155, 2);
  });

  it("falla la cotización Yahoo si no hay FX para la divisa (mejor que valorar mal)", async () => {
    vi.mocked(fetchQuote).mockRejectedValue(new Error("Finnhub quote error 403"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(yahooChartResponse(100, "SEK")));

    await expect(getCurrentQuote("VOLV-B.ST")).rejects.toThrow("Sin datos de precio");
  });

  it("usa Finnhub directamente para tickers con precio válido (USD)", async () => {
    vi.mocked(fetchQuote).mockResolvedValue({ c: 208.19, d: -0.46, dp: -0.22, h: 0, l: 0, o: 0, pc: 208.65, t: 0 });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const q = await getCurrentQuote("NVDA");
    expect(q.price).toBeCloseTo(208.19, 2);
    expect(q.currency).toBe("USD");
    expect(q.priceUSD).toBeCloseTo(208.19, 2);
    expect(fetchSpy).not.toHaveBeenCalled(); // Yahoo no se consulta
  });

  it("lanza error solo cuando Finnhub Y Yahoo fallan", async () => {
    vi.mocked(fetchQuote).mockRejectedValue(new Error("Finnhub quote error 429"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false } as unknown as Response));

    await expect(getCurrentQuote("SAB.MC")).rejects.toThrow("Sin datos de precio");
  });
});
