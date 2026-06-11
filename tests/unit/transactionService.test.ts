import { describe, it, expect } from "vitest";
import { calculatePositionMetrics } from "@/services/transactionService";
import type { TransactionRecord } from "@/repositories/transactionRepository";

const DAY = 86_400_000;

function tx(
  type: "BUY" | "SELL" | "SPLIT" | "DIVIDEND",
  shares: number,
  price: number,
  daysAgo: number,
  fee = 0,
  id = `${type}-${shares}-${price}-${daysAgo}`
): TransactionRecord {
  const date = new Date(Date.now() - daysAgo * DAY);
  return {
    id,
    stockId: "stock-1",
    type,
    shares,
    price,
    fee,
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

describe("calculatePositionMetrics — splits", () => {
  it("split 10:1 multiplica acciones y divide coste medio (caso NFLX)", () => {
    // Compra 5 × $965.50 pre-split; split 10:1 → 50 acc. a WAC $96.55
    const m = calculatePositionMetrics(
      [tx("BUY", 5, 965.5, 216), tx("SPLIT", 10, 1, 100)],
      "stock-1", "NFLX", 81.41
    );
    expect(m.openShares).toBe(50);
    expect(m.avgBuyPrice).toBeCloseTo(96.55, 2);
    expect(m.openCostBasis).toBeCloseTo(4827.5, 1);   // capital invariante
    expect(m.unrealizedPnL).toBeCloseTo(50 * 81.41 - 4827.5, 1);
  });

  it("venta post-split usa el WAC ajustado", () => {
    // 10 × $100; split 2:1 → 20 a $50; vende 10 a $60 → +$100 realizado
    const m = calculatePositionMetrics(
      [tx("BUY", 10, 100, 300), tx("SPLIT", 2, 1, 200), tx("SELL", 10, 60, 100)],
      "stock-1", "TEST", 55
    );
    expect(m.openShares).toBe(10);
    expect(m.realizedPnL).toBeCloseTo(100, 2);
    expect(m.avgBuyPrice).toBeCloseTo(50, 2);
  });

  it("contrasplit 1:10 (factor 0.1) reduce acciones y multiplica el coste", () => {
    const m = calculatePositionMetrics(
      [tx("BUY", 100, 2, 300), tx("SPLIT", 0.1, 1, 100)],
      "stock-1", "TEST", 22
    );
    expect(m.openShares).toBe(10);
    expect(m.avgBuyPrice).toBeCloseTo(20, 2);
    expect(m.openCostBasis).toBeCloseTo(200, 2);
  });

  it("split sobre posición cerrada es un no-op y no altera daysHeld", () => {
    const m = calculatePositionMetrics(
      [tx("BUY", 10, 100, 400), tx("SELL", 10, 120, 300), tx("SPLIT", 10, 1, 100)],
      "stock-1", "TEST", null
    );
    expect(m.openShares).toBe(0);
    expect(m.daysHeld).toBe(100);   // de compra a venta, el split no cuenta
    expect(m.realizedPnL).toBe(200);
  });
});

describe("calculatePositionMetrics — comisiones y dividendos", () => {
  it("la comisión de compra se capitaliza en el coste base", () => {
    // 10 × $100 + $10 com. → coste 1010, WAC 101
    const m = calculatePositionMetrics(
      [tx("BUY", 10, 100, 100, 10)],
      "stock-1", "TEST", 101
    );
    expect(m.avgBuyPrice).toBeCloseTo(101, 2);
    expect(m.openCostBasis).toBeCloseTo(1010, 2);
    expect(m.unrealizedPnL).toBeCloseTo(0, 2);
    expect(m.totalFees).toBe(10);
  });

  it("la comisión de venta reduce el PnL realizado", () => {
    const m = calculatePositionMetrics(
      [tx("BUY", 10, 100, 100), tx("SELL", 10, 110, 50, 5)],
      "stock-1", "TEST", null
    );
    expect(m.realizedPnL).toBeCloseTo(95, 2);   // 100 − 5 de comisión
    expect(m.totalFees).toBe(5);
  });

  it("los dividendos se acumulan netos de retención sin alterar la posición", () => {
    // 10 acc.; dividendo 10 × $0.50 = $5 bruto − $1 retención = $4 neto
    const m = calculatePositionMetrics(
      [tx("BUY", 10, 100, 100), tx("DIVIDEND", 10, 0.5, 50, 1)],
      "stock-1", "TEST", 100
    );
    expect(m.openShares).toBe(10);
    expect(m.totalDividends).toBeCloseTo(4, 2);
    expect(m.totalFees).toBe(1);
    expect(m.unrealizedPnL).toBeCloseTo(0, 2);  // la posición no cambia
  });

  it("los dividendos reducen el break-even y entran en el CAGR", () => {
    // 10 × $100; dividendos netos $50 → BE (1000−50)/10 = $95
    const m = calculatePositionMetrics(
      [tx("BUY", 10, 100, 365), tx("DIVIDEND", 10, 5, 100)],
      "stock-1", "TEST", 100
    );
    expect(m.breakEvenPrice).toBeCloseTo(95, 2);
    // riqueza final 1000 + 50 = 1050 sobre 1000 en 365d → +5%
    expect(m.annualizedReturn).toBeCloseTo(5, 0);
  });

  it("un dividendo tras cerrar la posición no reabre ni extiende daysHeld", () => {
    const m = calculatePositionMetrics(
      [tx("BUY", 10, 100, 400), tx("SELL", 10, 110, 300), tx("DIVIDEND", 10, 0.5, 250)],
      "stock-1", "TEST", null
    );
    expect(m.openShares).toBe(0);
    expect(m.daysHeld).toBe(100);
    expect(m.totalDividends).toBeCloseTo(5, 2);
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
