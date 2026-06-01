import { createHash, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Validates a provided secret against CRON_SECRET using a constant-time
 * comparison (crypto.timingSafeEqual) to prevent timing-based side-channel
 * attacks. Both sides are SHA-256 hashed first so the buffers are always the
 * same length regardless of input, which is required by timingSafeEqual.
 */
export function validateCronSecret(provided: string): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !provided) return false;

  const expectedBuf = createHash("sha256").update(expected).digest();
  const providedBuf = createHash("sha256").update(provided).digest();

  return timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Extracts the token from an "Authorization: Bearer <token>" header.
 * Returns an empty string if the header is missing or malformed.
 */
export function extractBearerToken(request: NextRequest): string {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice(7);
}

/**
 * Returns true if the request carries a valid CRON_SECRET Bearer token.
 */
export function isCronAuthorized(request: NextRequest): boolean {
  return validateCronSecret(extractBearerToken(request));
}

/**
 * Standard 401 JSON response for unauthorized cron requests.
 */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}
