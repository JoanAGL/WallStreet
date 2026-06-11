import { describe, it, expect } from "vitest";
import { computePendingSplits, type SplitEvent } from "@/services/splitDetectionService";
import type { TransactionRecord } from "@/repositories/transactionRepository";

const DAY = 86_400_000;

function tx(
  type: "BUY" | "SELL" | "SPLIT" | "DIVIDEND",
  daysAgo: number,
  shares = 10,
  price = 100
): TransactionRecord {
  const date = new Date(Date.now() - daysAgo * DAY);
  return {
    id: `${type}-${daysAgo}`,
    stockId: "stock-1",
    type,
    shares,
    price,
    fee: 0,
    date,
    notes: null,
    createdAt: date,
  } as TransactionRecord;
}

function ev(daysAgo: number, numerator: number, denominator: number): SplitEvent {
  return { date: Date.now() - daysAgo * DAY, numerator, denominator };
}

describe("computePendingSplits", () => {
  it("detecta un split posterior a la primera compra (caso NFLX 10:1)", () => {
    const pending = computePendingSplits(
      [tx("BUY", 300), tx("SELL", 250, 5)],
      [ev(200, 10, 1)]
    );
    expect(pending).toHaveLength(1);
    expect(pending[0].factor).toBe(10);
    expect(pending[0].label).toBe("10:1");
  });

  it("ignora splits anteriores a la primera compra (no afectan a la posición)", () => {
    const pending = computePendingSplits([tx("BUY", 100)], [ev(200, 10, 1)]);
    expect(pending).toHaveLength(0);
  });

  it("no duplica si ya existe un SPLIT registrado a ±7 días del evento", () => {
    const pending = computePendingSplits(
      [tx("BUY", 300), tx("SPLIT", 198, 10, 1)],
      [ev(200, 10, 1)]
    );
    expect(pending).toHaveLength(0);
  });

  it("sí registra si el SPLIT existente está lejos del evento (otro split)", () => {
    const pending = computePendingSplits(
      [tx("BUY", 600), tx("SPLIT", 500, 2, 1)],
      [ev(500, 2, 1), ev(100, 10, 1)]
    );
    expect(pending).toHaveLength(1);
    expect(pending[0].factor).toBe(10);
  });

  it("contrasplit 1:10 produce factor 0.1", () => {
    const pending = computePendingSplits([tx("BUY", 300)], [ev(100, 1, 10)]);
    expect(pending).toHaveLength(1);
    expect(pending[0].factor).toBeCloseTo(0.1, 6);
    expect(pending[0].label).toBe("1:10");
  });

  it("sin compras no hay nada que ajustar", () => {
    expect(computePendingSplits([], [ev(100, 10, 1)])).toHaveLength(0);
    expect(computePendingSplits([tx("DIVIDEND", 300)], [ev(100, 10, 1)])).toHaveLength(0);
  });

  it("ignora ratios degenerados (1:1) y ordena cronológicamente", () => {
    const pending = computePendingSplits(
      [tx("BUY", 600)],
      [ev(100, 1, 1), ev(50, 2, 1), ev(300, 10, 1)]
    );
    expect(pending).toHaveLength(2);
    expect(pending[0].label).toBe("10:1");
    expect(pending[1].label).toBe("2:1");
  });
});
