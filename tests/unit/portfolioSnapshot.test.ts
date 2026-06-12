import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/services/transactionService", () => ({ getPortfolioMetrics: vi.fn() }));
vi.mock("@/repositories/transactionRepository", () => ({ getTransactionsByUser: vi.fn() }));

import { computeTwr } from "@/services/portfolioSnapshotService";

const DAY = 86_400_000;
const t0 = Date.UTC(2026, 0, 1);

function snap(day: number, totalValue: number, netFlows = 0) {
  return { dateMs: t0 + day * DAY, totalValue, netFlows };
}

describe("computeTwr", () => {
  it("null con menos de 2 snapshots", () => {
    expect(computeTwr([]).twrPct).toBeNull();
    expect(computeTwr([snap(0, 1000)]).twrPct).toBeNull();
  });

  it("retorno simple sin flujos: 1000 → 1100 = +10%", () => {
    const r = computeTwr([snap(0, 1000), snap(10, 1100)]);
    expect(r.twrPct).toBeCloseTo(10, 2);
    expect(r.spanDays).toBe(10);
    expect(r.twrAnnualized).toBeNull(); // < 30 días
  });

  it("neutraliza una aportación: comprar más no es rentabilidad", () => {
    // Día 10: el valor sube a 2100 pero 1000 son una compra nueva →
    // retorno real del tramo: (2100 − 1000)/1000 − 1 = +10%
    const r = computeTwr([snap(0, 1000), snap(10, 2100, 1000)]);
    expect(r.twrPct).toBeCloseTo(10, 2);
  });

  it("neutraliza una retirada: vender no es pérdida", () => {
    // Vende 500: valor cae a 550 con flujo −500 → (550 + 500)/1000 − 1 = +5%
    const r = computeTwr([snap(0, 1000), snap(10, 550, -500)]);
    expect(r.twrPct).toBeCloseTo(5, 2);
  });

  it("encadena varios tramos geométricamente", () => {
    // +10% y luego −10% → 0.99 − 1 = −1%
    const r = computeTwr([snap(0, 1000), snap(10, 1100), snap(20, 990)]);
    expect(r.twrPct).toBeCloseTo(-1, 2);
  });

  it("anualiza a partir de 30 días", () => {
    const r = computeTwr([snap(0, 1000), snap(73, 1100)]);  // +10% en 73d = 1/5 de año
    expect(r.twrAnnualized).toBeCloseTo((Math.pow(1.1, 5) - 1) * 100, 0);  // ≈ +61%
  });

  it("omite tramos con valor previo 0 (posición vaciada)", () => {
    const r = computeTwr([snap(0, 1000), snap(5, 0, -1000), snap(10, 500, 500)]);
    // tramo 1: (0+1000)/1000 − 1 = 0%; tramo 2: prev=0 → omitido
    expect(r.twrPct).toBeCloseTo(0, 2);
  });
});
