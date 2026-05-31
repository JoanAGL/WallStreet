import { test, expect } from "@playwright/test";

/**
 * E2E: Authentication and route protection.
 *
 * These tests verify that:
 *  - Unauthenticated users are redirected to /login from protected routes
 *  - The login page renders the expected form elements
 *  - The login form validates input (client-side)
 *
 * Note: Tests that require a live DB session (actual login with credentials)
 * are marked with test.skip and should be enabled in CI with TEST_EMAIL /
 * TEST_PASSWORD environment variables and a seeded test user.
 */

test.describe("Route protection", () => {
  test("dashboard redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login|\/signin/);
  });

  test("portfolio optimize redirects unauthenticated requests", async ({ request }) => {
    const res = await request.get("/api/portfolio/optimize");
    // NextAuth returns 302 redirect or 401 for API routes depending on config
    expect([200, 302, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty("error");
    }
  });

  test("macro flash returns 401 without session", async ({ request }) => {
    const res = await request.get("/api/macro/flash");
    expect([302, 401]).toContain(res.status());
  });
});

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("renders email and password fields", async ({ page }) => {
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("submit button is present", async ({ page }) => {
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();
  });

  test("empty form submission shows validation feedback", async ({ page }) => {
    await page.locator('button[type="submit"]').click();
    // Browser native validation or custom error — page should not navigate away
    await expect(page).toHaveURL(/\/login/);
  });
});

// ── Auth-required flows (skip unless test credentials are configured) ──────────

test.describe("Authenticated flows", () => {
  test.skip(
    !process.env.TEST_EMAIL || !process.env.TEST_PASSWORD,
    "Requires TEST_EMAIL and TEST_PASSWORD env vars with a seeded test user"
  );

  test("login with valid credentials reaches dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"], input[name="email"]').fill(process.env.TEST_EMAIL!);
    await page.locator('input[type="password"]').fill(process.env.TEST_PASSWORD!);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });
});
