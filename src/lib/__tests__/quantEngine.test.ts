import { describe, it, expect, vi, beforeEach } from "vitest";
import { kellyFraction } from "../../services/quantitativeService";
import { CircuitBreaker } from "../circuitBreaker";

// ── kellyFraction ─────────────────────────────────────────────────────────────

describe("kellyFraction", () => {
  it("returns 0 for zero or negative variance", () => {
    expect(kellyFraction(0.10, 0)).toBe(0);
    expect(kellyFraction(0.10, -0.01)).toBe(0);
  });

  it("returns 0 when expected return <= risk-free rate", () => {
    // Asset earns exactly risk-free: no Kelly allocation
    expect(kellyFraction(0.035, 0.04, 0.035)).toBe(0);
    // Asset earns below risk-free
    expect(kellyFraction(0.02, 0.04, 0.035)).toBe(0);
  });

  it("computes f* = (μ - r) / σ² correctly", () => {
    // μ=0.10, σ²=0.04, r=0.03 → f* = (0.10-0.03)/0.04 = 1.75 → capped at 1
    expect(kellyFraction(0.10, 0.04, 0.03)).toBe(1);
    // μ=0.08, σ²=0.16, r=0.03 → f* = (0.08-0.03)/0.16 = 0.3125
    expect(kellyFraction(0.08, 0.16, 0.03)).toBeCloseTo(0.3125, 4);
  });

  it("caps result at 1.0 (no leverage)", () => {
    // High return, low variance → f* >> 1 → capped
    expect(kellyFraction(0.50, 0.01, 0.03)).toBe(1);
  });

  it("floors result at 0 (no shorting)", () => {
    // Negative excess return → 0 not negative
    expect(kellyFraction(0.01, 0.04, 0.05)).toBe(0);
  });

  it("result is in [0, 1] for any plausible inputs", () => {
    const cases = [
      [0.05, 0.02, 0.035],
      [0.12, 0.06, 0.035],
      [0.25, 0.20, 0.035],
      [0.00, 0.10, 0.035],
      [-0.10, 0.05, 0.035],
    ] as const;
    cases.forEach(([mu, v, r]) => {
      const f = kellyFraction(mu, v, r);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    });
  });
});

// ── CircuitBreaker ────────────────────────────────────────────────────────────

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker("test", 3, 5000);
  });

  it("starts CLOSED and passes calls through", async () => {
    const result = await breaker.fire(async () => "ok", () => "fallback");
    expect(result).toBe("ok");
    expect(breaker.status).toBe("CLOSED");
  });

  it("returns fallback when action throws", async () => {
    const result = await breaker.fire(
      async () => { throw new Error("boom"); },
      () => "fallback"
    );
    expect(result).toBe("fallback");
  });

  it("opens after threshold consecutive failures", async () => {
    const fail = async (): Promise<string> => { throw new Error("fail"); };
    for (let i = 0; i < 3; i++) {
      await breaker.fire(fail, () => "fb");
    }
    expect(breaker.isOpen).toBe(true);
    expect(breaker.status).toBe("OPEN");
  });

  it("returns fallback immediately when OPEN (no action call)", async () => {
    // Force open
    const fail = async (): Promise<string> => { throw new Error("fail"); };
    for (let i = 0; i < 3; i++) await breaker.fire(fail, () => "fb");

    const spy = vi.fn(async () => "action");
    const result = await breaker.fire(spy, () => "fallback");

    expect(result).toBe("fallback");
    expect(spy).not.toHaveBeenCalled();
  });

  it("resets to CLOSED after successful action following cooldown", async () => {
    // Use a very short timeout to test recovery
    const quickBreaker = new CircuitBreaker("quick", 1, 10); // 10ms cooldown
    const fail = async (): Promise<string> => { throw new Error("fail"); };
    await quickBreaker.fire(fail, () => "fb"); // opens immediately (threshold=1)
    expect(quickBreaker.isOpen).toBe(true);

    // Wait for cooldown
    await new Promise((r) => setTimeout(r, 15));

    // Should enter HALF_OPEN and recover
    const result = await quickBreaker.fire(async () => "recovered", () => "fb");
    expect(result).toBe("recovered");
    expect(quickBreaker.status).toBe("CLOSED");
  });

  it("reset() clears state and allows calls again", async () => {
    const fail = async (): Promise<string> => { throw new Error("fail"); };
    for (let i = 0; i < 3; i++) await breaker.fire(fail, () => "fb");
    expect(breaker.isOpen).toBe(true);

    breaker.reset();
    expect(breaker.status).toBe("CLOSED");

    const result = await breaker.fire(async () => "restored", () => "fb");
    expect(result).toBe("restored");
  });

  it("accepts async fallback", async () => {
    const fail = async (): Promise<number> => { throw new Error("fail"); };
    const result = await breaker.fire(fail, async () => 42);
    expect(result).toBe(42);
  });
});
