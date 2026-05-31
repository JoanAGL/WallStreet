import { test, expect } from "@playwright/test";

/**
 * E2E: API contract tests via Playwright's request API.
 *
 * These tests validate the HTTP API surface — status codes, response shapes,
 * and error handling — without requiring a real browser session.
 *
 * They run against the live dev server (or deployed URL via BASE_URL).
 * Unauthenticated calls verify error contracts; authenticated calls require
 * TEST_EMAIL / TEST_PASSWORD to be configured.
 */

test.describe("API error contracts (no auth)", () => {
  test("POST /api/update without auth returns 401 or redirect", async ({ request }) => {
    const res = await request.post("/api/update", { data: {} });
    expect([302, 401]).toContain(res.status());
  });

  test("GET /api/portfolio/optimize without auth returns 401 or redirect", async ({ request }) => {
    const res = await request.get("/api/portfolio/optimize");
    expect([302, 401]).toContain(res.status());
  });

  test("GET /api/portfolio/rebalance without auth returns 401 or redirect", async ({ request }) => {
    const res = await request.get("/api/portfolio/rebalance");
    expect([302, 401]).toContain(res.status());
  });

  test("POST /api/portfolio/simulation without auth returns 401 or redirect", async ({ request }) => {
    const res = await request.post("/api/portfolio/simulation", { data: {} });
    expect([302, 401]).toContain(res.status());
  });

  test("GET /api/market/top-gainers without auth returns 401 or redirect", async ({ request }) => {
    const res = await request.get("/api/market/top-gainers");
    expect([302, 401]).toContain(res.status());
  });

  test("GET /api/macro/flash without auth returns 401 or redirect", async ({ request }) => {
    const res = await request.get("/api/macro/flash");
    expect([302, 401]).toContain(res.status());
  });
});

// ── Authenticated API contract tests ─────────────────────────────────────────

test.describe("API contracts (authenticated)", () => {
  test.skip(
    !process.env.TEST_EMAIL || !process.env.TEST_PASSWORD,
    "Requires TEST_EMAIL and TEST_PASSWORD env vars with a seeded test user"
  );

  let authCookies: string[] = [];

  test.beforeAll(async ({ request }) => {
    // Obtain NextAuth session cookie via credentials provider
    const loginRes = await request.post("/api/auth/callback/credentials", {
      data: {
        email: process.env.TEST_EMAIL,
        password: process.env.TEST_PASSWORD,
        redirect: false,
        csrfToken: "", // NextAuth requires CSRF token; use the one from /api/auth/csrf
      },
    });
    authCookies = loginRes.headers()["set-cookie"]?.split(",") ?? [];
  });

  test("GET /api/portfolio/optimize returns valid optimization shape", async ({ request }) => {
    const res = await request.get("/api/portfolio/optimize", {
      headers: { Cookie: authCookies.join("; ") },
    });
    // 200 = has stocks with analysis | 400 = needs at least 2 stocks (valid error)
    expect([200, 400]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty("tickers");
      expect(body).toHaveProperty("optimalWeights");
      expect(body).toHaveProperty("currentWeights");
      expect(body).toHaveProperty("meta");
      const meta = body.meta as Record<string, unknown>;
      expect(["black-litterman", "markowitz"]).toContain(meta.model);

      const weights = body.optimalWeights as number[];
      const sum = weights.reduce((s, w) => s + w, 0);
      expect(sum).toBeCloseTo(1, 3);
    }
  });

  test("POST /api/portfolio/simulation returns Monte Carlo shape with CVaR", async ({ request }) => {
    const res = await request.post("/api/portfolio/simulation", {
      headers: { Cookie: authCookies.join("; ") },
      data: { horizon: 1, portfolioValue: 10000 },
    });
    expect([200, 400]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty("p50");
      expect(body).toHaveProperty("var95");
      expect(body).toHaveProperty("cvar95");
      expect(body).toHaveProperty("probabilityOfLoss");
      expect(body).toHaveProperty("stressTests");

      const stress = body.stressTests as Array<Record<string, unknown>>;
      expect(stress).toHaveLength(5);
      stress.forEach((s) => {
        expect(s).toHaveProperty("scenario");
        expect(s).toHaveProperty("portfolioLoss");
        expect(s).toHaveProperty("finalValue");
      });
    }
  });

  test("GET /api/portfolio/rebalance returns trade list", async ({ request }) => {
    const res = await request.get("/api/portfolio/rebalance", {
      headers: { Cookie: authCookies.join("; ") },
    });
    expect([200, 400]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty("trades");
      expect(body).toHaveProperty("totalPortfolioValue");
      expect(body).toHaveProperty("model");
      expect(["black-litterman", "markowitz"]).toContain(body.model);

      const trades = body.trades as Array<Record<string, unknown>>;
      trades.forEach((t) => {
        expect(t).toHaveProperty("ticker");
        expect(["BUY", "SELL", "HOLD"]).toContain(t.action);
        expect(typeof t.currentWeight).toBe("number");
        expect(typeof t.targetWeight).toBe("number");
      });
    }
  });
});
