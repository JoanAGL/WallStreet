import { describe, it, expect } from "vitest";
import { calculatePositionMetrics } from "@/services/transactionService";
import type { TransactionRecord } from "@/repositories/transactionRepository";

const DAY = 86_400_000;

function tx(
  type: "BUY" | "SELL",
  shares: number,
  price: number,
  daysAgo: number,
  id = `${type}-${shares}-${price}-${daysAgo}`
): TransactionRecord {
  const date = new Date(Date.now() - daysAgo * DAY);
  return {
    id,
    stockId: "stock-1",
    type,
    shares,
    price,
    date,
    notes: null,
    createdAt: date,
    updatedAt: date,
  } as TransactionRecord;
}

describe("calculatePositionMetrics — WAC básico", () => {
  it("calcula WAC con varias compras", () => {
    const m = calculatePositionMetrics(
      [tx("BUY", 10, 100, 200), tx("BUY", 10, 200, 100)],
      "stock-1", "TEST", 150
    );
    expect(m.openShares).toBe(20);
    expect(m.avgBuyPrice).toBe(150);
    expect(m.openCostBasis).toBe(3000);
    expect(m.currentValue).toBe(3000);
    expect(m.unrealizedPnL).toBe(0);
  });

  it("calcula PnL realizado con venta parcial", () => {
    const m = calculatePositionMetrics(
      [tx("BUY", 10, 100, 200), tx("SELL", 5, 120, 100)],
      "stock-1", "TEST", 110
    );
    expect(m.openShares).toBe(5);
    expect(m.realizedPnL).toBe(100);     // 5 × (120 − 100)
    expect(m.avgSellPrice).toBe(120);
    expect(m.unrealizedPnL).toBe(50);    // 5 × (110 − 100)
  });
});

describe("calculatePositionMetrics — CAGR", () => {
  it("CAGR positivo en posición ganadora con ventas parciales (bug ORCL −86%)", () => {
    // Compra 20 × $100, vende 10 × $120 hace poco, quedan 10 a $130 actual.
    // Riqueza final = 1300 (abierto) + 1200 (proceeds) = 2500 sobre 2000 invertidos.
    const m = calculatePositionMetrics(
      [tx("BUY", 20, 100, 365), tx("SELL", 10, 120, 30)],
      "stock-1", "TEST", 130
    );
    expect(m.daysHeld).toBe(365);
    // ratio 1.25 en 365d → +25% CAGR
    expect(m.annualizedReturn).toBeCloseTo(25, 0);
    expect(m.annualizedReturn!).toBeGreaterThan(0);
  });

  it("CAGR de posición cerrada usa proceeds y fecha de cierre (bug AMD +3.95%)", () => {
    // Compra 10 × $100 hace 730d, vende todo a $200 hace 365d → ×2 en 1 año = +100% CAGR
    const m = calculatePositionMetrics(
      [tx("BUY", 10, 100, 730), tx("SELL", 10, 200, 365)],
      "stock-1", "TEST", null
    );
    expect(m.daysHeld).toBe(365);          // hasta la venta, no hasta hoy
    expect(m.annualizedReturn).toBeCloseTo(100, 0);
  });

  it("suprime CAGR con menos de 30 días (bug CRM −99.97% en 8 días)", () => {
    const m = calculatePositionMetrics(
      [tx("BUY", 20, 209.5, 8)],
      "stock-1", "TEST", 175.35
    );
    expect(m.daysHeld).toBe(8);
    expect(m.annualizedReturn).toBeNull();
  });

  it("CAGR null sin precio de mercado en posición abierta usa coste (sin cambio)", () => {
    const m = calculatePositionMetrics(
      [tx("BUY", 10, 100, 365)],
      "stock-1", "TEST", null
    );
    // Sin precio: riqueza final = coste → ratio 1 → 0%
    expect(m.annualizedReturn).toBeCloseTo(0, 5);
  });
});

describe("calculatePositionMetrics — días en cartera", () => {
  it("posición abierta cuenta hasta hoy", () => {
    const m = calculatePositionMetrics([tx("BUY", 10, 100, 100)], "stock-1", "TEST", 100);
    expect(m.daysHeld).toBe(100);
  });

  it("posición cerrada cuenta hasta la última transacción (bug 527 días)", () => {
    const m = calculatePositionMetrics(
      [tx("BUY", 10, 100, 527), tx("SELL", 10, 110, 400)],
      "stock-1", "TEST", null
    );
    expect(m.daysHeld).toBe(127);
  });
});

describe("calculatePositionMetrics — break-even", () => {
  it("sin ventas, break-even = precio medio de compra", () => {
    const m = calculatePositionMetrics([tx("BUY", 10, 100, 100)], "stock-1", "TEST", 90);
    expect(m.breakEvenPrice).toBe(100);
  });

  it("el beneficio realizado reduce el break-even de las acciones abiertas", () => {
    // 10 × $100; vende 5 a $150 (+$250). Quedan 5 con coste 500 − 250 = 250 → BE $50
    const m = calculatePositionMetrics(
      [tx("BUY", 10, 100, 100), tx("SELL", 5, 150, 50)],
      "stock-1", "TEST", 100
    );
    expect(m.breakEvenPrice).toBe(50);
  });

  it("break-even no baja de 0 aunque lo realizado supere el coste restante", () => {
    const m = calculatePositionMetrics(
      [tx("BUY", 10, 100, 100), tx("SELL", 9, 500, 50)],
      "stock-1", "TEST", 100
    );
    expect(m.breakEvenPrice).toBe(0);
  });

  it("posición cerrada no tiene break-even", () => {
    const m = calculatePositionMetrics(
      [tx("BUY", 10, 100, 100), tx("SELL", 10, 110, 50)],
      "stock-1", "TEST", null
    );
    expect(m.breakEvenPrice).toBeNull();
  });
});

describe("calculatePositionMetrics — ventas con exceso de acciones", () => {
  it("recorta la venta a las acciones disponibles", () => {
    const m = calculatePositionMetrics(
      [tx("BUY", 5, 100, 100), tx("SELL", 10, 120, 50)],
      "stock-1", "TEST", null
    );
    expect(m.openShares).toBe(0);
    expect(m.realizedPnL).toBe(100); // 5 × 20, no 10 × 20
  });
});
