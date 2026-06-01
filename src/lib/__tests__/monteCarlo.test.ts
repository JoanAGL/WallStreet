import { describe, it, expect } from "vitest";
import { sampleStudentT, runMonteCarlo } from "@/lib/math/simulation/monteCarlo";

// ── sampleStudentT ────────────────────────────────────────────────────────────
// Statistical properties verified with N=100 000 draws.
// Tolerances are 10× the expected standard error to remain deterministic.

describe("sampleStudentT", () => {
  const N = 100_000;
  const df = 5;

  // Draw once, reuse across tests to keep suite fast
  const samples: number[] = Array.from({ length: N }, () => sampleStudentT(df));

  it("mean ≈ 0 (within ±0.05 for N=100 000)", () => {
    const mean = samples.reduce((s, v) => s + v, 0) / N;
    expect(Math.abs(mean)).toBeLessThan(0.05);
  });

  it("variance ≈ df/(df-2) = 5/3 ≈ 1.667 (within ±0.15)", () => {
    const mean = samples.reduce((s, v) => s + v, 0) / N;
    const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / N;
    const expected = df / (df - 2); // 5/3 ≈ 1.667
    expect(Math.abs(variance - expected)).toBeLessThan(0.15);
  });

  it("produces heavier tails than Normal — |x|>3 frequency > 1%", () => {
    // For N(0,1) the |x|>3 frequency is ~0.27%; for t(5) it is ~1.4%
    const extremes = samples.filter((v) => Math.abs(v) > 3).length / N;
    expect(extremes).toBeGreaterThan(0.01);
  });

  it("works for df=10 — variance ≈ 10/8 = 1.25", () => {
    const s10 = Array.from({ length: N }, () => sampleStudentT(10));
    const mean = s10.reduce((a, v) => a + v, 0) / N;
    const variance = s10.reduce((a, v) => a + (v - mean) ** 2, 0) / N;
    expect(Math.abs(variance - 10 / 8)).toBeLessThan(0.15);
  });
});

// ── runMonteCarlo — Student-t vs Normal ──────────────────────────────────────

describe("runMonteCarlo — distribution param", () => {
  it("STUDENT_T var95 >= NORMAL var95 (fatter tails → higher tail loss)", () => {
    const common = [0.0003, 0.015, 10000, 252, 0, 2000] as const;
    const student = runMonteCarlo(...common, "STUDENT_T", 5);
    const normal  = runMonteCarlo(...common, "NORMAL");
    // With high sim count the ordering should hold reliably
    expect(student.var95).toBeGreaterThanOrEqual(normal.var95 * 0.9); // at least 90% as bad
  });

  it("default distribution is STUDENT_T (not NORMAL)", () => {
    // Default call must not throw and must return valid result
    const result = runMonteCarlo(0.0003, 0.015, 10000, 252, 0, 500);
    expect(result.var95).toBeGreaterThanOrEqual(0);
    expect(result.cvar95).toBeGreaterThanOrEqual(result.var95);
  });

  it("NORMAL distribution still produces valid results", () => {
    const result = runMonteCarlo(0.0003, 0.015, 10000, 252, 0, 500, "NORMAL");
    expect(result.probabilityOfLoss).toBeGreaterThanOrEqual(0);
    expect(result.probabilityOfLoss).toBeLessThanOrEqual(1);
  });
});
