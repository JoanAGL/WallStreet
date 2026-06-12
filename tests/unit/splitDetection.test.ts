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
    id: `${type}-${daysAgo}-${shares}-${price}`,
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

describe("computePendingSplits — detección con corroboración", () => {
  it("aplica split 10:1 cuando el WAC pre-split es coherente con las compras post-split", () => {
    // Compra pre-split a $1.090; tras el split compra a $96 → 1090/(10×96)≈1.13 ✓
    const pending = computePendingSplits(
      [tx("BUY", 300, 2, 1090), tx("BUY", 150, 48, 96)],
      [ev(200, 10, 1)]
    );
    expect(pending).toHaveLength(1);
    expect(pending[0].factor).toBe(10);
    expect(pending[0].label).toBe("10:1");
  });

  it("aplica split corroborando con el precio de mercado si no hay compras post-split", () => {
    // WAC pre-split $1.090, mercado actual $96 → 1090/(10×96)≈1.13 ✓
    const pending = computePendingSplits(
      [tx("BUY", 300, 2, 1090)],
      [ev(200, 10, 1)],
      96
    );
    expect(pending).toHaveLength(1);
  });

  it("RECHAZA el split si el historial ya está en términos post-split (caso NFLX)", () => {
    // WAC pre-split ~$210 con compras post-split a ~$96:
    // 210/(10×96)=0.22 fuera de [0.5,2] → el historial ya está ajustado
    const pending = computePendingSplits(
      [tx("BUY", 300, 23, 210), tx("BUY", 150, 32, 96)],
      [ev(200, 10, 1)]
    );
    expect(pending).toHaveLength(0);
  });

  it("NO auto-aplica sin ninguna referencia de corroboración", () => {
    // Sin compras post-split y sin precio de mercado → registro manual
    const pending = computePendingSplits(
      [tx("BUY", 300, 2, 1090)],
      [ev(200, 10, 1)]
    );
    expect(pending).toHaveLength(0);
  });

  it("ignora splits sin posición abierta en la fecha del evento", () => {
    const pending = computePendingSplits(
      [tx("BUY", 300, 10, 1090), tx("SELL", 250, 10, 1100), tx("BUY", 150, 50, 96)],
      [ev(200, 10, 1)],
      96
    );
    expect(pending).toHaveLength(0);
  });

  it("ignora splits anteriores a la primera compra", () => {
    const pending = computePendingSplits([tx("BUY", 100, 10, 96)], [ev(200, 10, 1)], 96);
    expect(pending).toHaveLength(0);
  });

  it("no duplica si ya existe un SPLIT registrado a ±7 días del evento", () => {
    const pending = computePendingSplits(
      [tx("BUY", 300, 2, 1090), tx("SPLIT", 198, 10, 1)],
      [ev(200, 10, 1)],
      96
    );
    expect(pending).toHaveLength(0);
  });

  it("contrasplit 1:10 con corroboración produce factor 0.1", () => {
    // Compra a $2; contrasplit 1:10 → precio esperado ~$20; mercado $22 ✓
    const pending = computePendingSplits(
      [tx("BUY", 300, 100, 2)],
      [ev(100, 1, 10)],
      22
    );
    expect(pending).toHaveLength(1);
    expect(pending[0].factor).toBeCloseTo(0.1, 6);
    expect(pending[0].label).toBe("1:10");
  });

  it("sin compras no hay nada que ajustar", () => {
    expect(computePendingSplits([], [ev(100, 10, 1)], 96)).toHaveLength(0);
    expect(computePendingSplits([tx("DIVIDEND", 300)], [ev(100, 10, 1)], 96)).toHaveLength(0);
  });

  it("ignora ratios degenerados (1:1)", () => {
    const pending = computePendingSplits(
      [tx("BUY", 600, 2, 1090)],
      [ev(100, 1, 1)],
      96
    );
    expect(pending).toHaveLength(0);
  });
});
