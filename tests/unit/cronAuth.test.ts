import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { validateCronSecret, extractBearerToken, isCronAuthorized, unauthorizedResponse } from "@/lib/cronAuth";
import type { NextRequest } from "next/server";

// Minimal NextRequest stub — only needs headers.get()
function makeRequest(authHeader?: string): NextRequest {
  return {
    headers: {
      get: (name: string) => (name === "authorization" ? (authHeader ?? null) : null),
    },
  } as unknown as NextRequest;
}

const REAL_SECRET = "super-secret-cron-token-32-chars!";

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", REAL_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ── validateCronSecret ────────────────────────────────────────────────────────

describe("validateCronSecret", () => {
  it("returns true for the correct secret", () => {
    expect(validateCronSecret(REAL_SECRET)).toBe(true);
  });

  it("returns false for an incorrect secret", () => {
    expect(validateCronSecret("wrong-secret")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(validateCronSecret("")).toBe(false);
  });

  it("returns false when the secret has the correct prefix but extra chars", () => {
    expect(validateCronSecret(REAL_SECRET + "x")).toBe(false);
  });

  it("returns false when CRON_SECRET env var is not set", () => {
    vi.unstubAllEnvs();
    delete process.env.CRON_SECRET;
    expect(validateCronSecret(REAL_SECRET)).toBe(false);
  });

  it("returns false when CRON_SECRET env var is empty string", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(validateCronSecret("")).toBe(false);
  });
});

// ── extractBearerToken ────────────────────────────────────────────────────────

describe("extractBearerToken", () => {
  it("extracts the token from a valid Bearer header", () => {
    expect(extractBearerToken(makeRequest(`Bearer ${REAL_SECRET}`))).toBe(REAL_SECRET);
  });

  it("returns empty string when the Authorization header is missing", () => {
    expect(extractBearerToken(makeRequest())).toBe("");
  });

  it("returns empty string when the header has no Bearer prefix", () => {
    expect(extractBearerToken(makeRequest(REAL_SECRET))).toBe("");
  });

  it("returns empty string for a bare 'Bearer' with no token", () => {
    expect(extractBearerToken(makeRequest("Bearer"))).toBe("");
  });

  it("returns empty string for a different auth scheme", () => {
    expect(extractBearerToken(makeRequest(`Basic ${REAL_SECRET}`))).toBe("");
  });
});

// ── isCronAuthorized ──────────────────────────────────────────────────────────

describe("isCronAuthorized", () => {
  it("returns true for a request with the correct Bearer token", () => {
    expect(isCronAuthorized(makeRequest(`Bearer ${REAL_SECRET}`))).toBe(true);
  });

  it("returns false for a request with an incorrect Bearer token", () => {
    expect(isCronAuthorized(makeRequest("Bearer wrong-token"))).toBe(false);
  });

  it("returns false when the Authorization header is missing", () => {
    expect(isCronAuthorized(makeRequest())).toBe(false);
  });

  it("returns false when CRON_SECRET is not configured", () => {
    vi.unstubAllEnvs();
    delete process.env.CRON_SECRET;
    expect(isCronAuthorized(makeRequest(`Bearer ${REAL_SECRET}`))).toBe(false);
  });
});

// ── unauthorizedResponse ──────────────────────────────────────────────────────

describe("unauthorizedResponse", () => {
  it("returns a 401 response", () => {
    const res = unauthorizedResponse();
    expect(res.status).toBe(401);
  });
});
