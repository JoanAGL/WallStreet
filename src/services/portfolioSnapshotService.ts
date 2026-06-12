import { prisma } from "@/lib/prisma";
import { getPortfolioMetrics } from "./transactionService";
import { getTransactionsByUser } from "@/repositories/transactionRepository";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface SnapshotPoint {
  date:       string;  // YYYY-MM-DD
  totalValue: number;  // USD
  costBasis:  number;  // USD
}

export interface EquityCurve {
  points:         SnapshotPoint[];
  /** Time-Weighted Return acumulado entre el primer y el último snapshot (%) */
  twrPct:         number | null;
  /** TWR anualizado (%) — null con menos de 30 días de historia */
  twrAnnualized:  number | null;
  spanDays:       number;
}

function dayStartUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Captura ───────────────────────────────────────────────────────────────────

/**
 * Captura (upsert) el snapshot del día: valor de mercado USD y coste base WAC
 * de las posiciones abiertas, más los flujos netos externos del día
 * (compras − ventas, en USD) necesarios para el TWR.
 *
 * Idempotente por (userId, día): se puede invocar tras cada actualización de
 * datos sin duplicar — la última captura del día pisa a la anterior.
 */
export async function capturePortfolioSnapshot(userId: string): Promise<void> {
  // Precios actuales en USD desde el último análisis (0/null = sin precio)
  const analyses = await prisma.stockAnalysis.findMany({
    where:  { stock: { userId } },
    select: { stockId: true, price: true, priceUSD: true },
  });
  const currentPrices: Record<string, number> = {};
  for (const a of analyses) {
    const usd = a.priceUSD ?? a.price;
    if (usd > 0) currentPrices[a.stockId] = usd;
  }

  const summary = await getPortfolioMetrics(userId, currentPrices);
  // Sin transacciones no hay nada que fotografiar
  if (summary.positions.length === 0) return;

  const today    = dayStartUTC(new Date());
  const tomorrow = new Date(today.getTime() + 86_400_000);

  // Flujos externos del día: compras (entra capital) − ventas netas (sale)
  const txs = await getTransactionsByUser(userId);
  let netFlows = 0;
  for (const tx of txs) {
    const d = tx.date ?? tx.createdAt;
    if (d < today || d >= tomorrow) continue;
    if (tx.type === "BUY")  netFlows += tx.price * tx.shares + (tx.fee ?? 0);
    if (tx.type === "SELL") netFlows -= tx.price * tx.shares - (tx.fee ?? 0);
  }

  await prisma.portfolioSnapshot.upsert({
    where:  { userId_date: { userId, date: today } },
    update: { totalValue: r2(summary.totalCurrentValue), costBasis: r2(summary.totalCostBasis), netFlows: r2(netFlows) },
    create: { userId, date: today, totalValue: r2(summary.totalCurrentValue), costBasis: r2(summary.totalCostBasis), netFlows: r2(netFlows) },
  });
}

// ── Lectura + TWR ─────────────────────────────────────────────────────────────

/**
 * Devuelve la curva de evolución y el Time-Weighted Return encadenado.
 *
 * TWR: r_i = (V_i − F_i) / V_{i−1} − 1, donde F_i son los flujos externos
 * netos del período (el snapshot guarda los del propio día). Neutraliza el
 * efecto de aportar o retirar capital: mide la habilidad inversora, no el
 * tamaño de las aportaciones. Los tramos con V_{i−1} ≤ 0 se omiten.
 */
export async function getEquityCurve(userId: string, maxPoints = 365): Promise<EquityCurve> {
  const snaps = await prisma.portfolioSnapshot.findMany({
    where:   { userId },
    orderBy: { date: "asc" },
    take:    maxPoints,
  });

  const points: SnapshotPoint[] = snaps.map((s) => ({
    date:       s.date.toISOString().slice(0, 10),
    totalValue: s.totalValue,
    costBasis:  s.costBasis,
  }));

  const twr = computeTwr(
    snaps.map((s) => ({ dateMs: s.date.getTime(), totalValue: s.totalValue, netFlows: s.netFlows }))
  );
  return { points, ...twr };
}

// ── TWR puro (testeable) ──────────────────────────────────────────────────────

export interface TwrInput {
  dateMs:     number;
  totalValue: number;
  netFlows:   number;  // flujos externos del día del snapshot (compras − ventas)
}

/**
 * TWR encadenado: r_i = (V_i − F_i) / V_{i−1} − 1. Tramos con V_{i−1} ≤ 0 o
 * retornos no finitos se omiten. Anualiza solo con ≥ 30 días de historia.
 */
export function computeTwr(
  snaps: TwrInput[]
): { twrPct: number | null; twrAnnualized: number | null; spanDays: number } {
  if (snaps.length < 2) return { twrPct: null, twrAnnualized: null, spanDays: 0 };

  let growth = 1;
  for (let i = 1; i < snaps.length; i++) {
    const prev = snaps[i - 1].totalValue;
    if (prev <= 0) continue;
    const r = (snaps[i].totalValue - snaps[i].netFlows) / prev - 1;
    if (!isFinite(r) || r <= -1) continue;
    growth *= 1 + r;
  }

  const spanDays = Math.max(
    1,
    Math.round((snaps[snaps.length - 1].dateMs - snaps[0].dateMs) / 86_400_000)
  );
  const twrPct = r2((growth - 1) * 100);
  const twrAnnualized = spanDays >= 30
    ? r2((Math.pow(growth, 365 / spanDays) - 1) * 100)
    : null;

  return { twrPct, twrAnnualized, spanDays };
}
