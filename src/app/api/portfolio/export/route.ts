import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStocksWithAnalysis } from "@/repositories/stockRepository";
import type { AllHorizonsAIAnalysis } from "@/services/aiAnalysisService";
import type { PriceRsiDivergence } from "@/services/technicalAnalysisService";

// Wraps a value in double quotes if it contains commas, double quotes, or newlines.
// Existing double quotes are escaped by doubling them (RFC 4180).
function csvField(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(fields: unknown[]): string {
  return fields.map(csvField).join(",");
}

const HEADERS = [
  "ticker", "price", "changePercent", "scenarioLabel", "confidenceScore",
  "rsi14", "sma20", "sma50", "atr14", "relativeVolume", "hurstExponent",
  "shortTermLabel", "shortTermProbPos", "shortTermProbNeu", "shortTermProbNeg",
  "mediumTermLabel", "mediumTermProbPos", "mediumTermProbNeu", "mediumTermProbNeg",
  "longTermLabel", "longTermProbPos", "longTermProbNeu", "longTermProbNeg",
  "sharpeRatio", "kellyFraction", "garchVol", "divergenceType",
  "purchasePrice", "quantity", "costBasis", "currentValue", "pnlUsd", "pnlPct",
  "generatedAt",
];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (new URL(req.url).searchParams.get("format") !== "csv") {
    return NextResponse.json({ error: "Formato no soportado. Usa ?format=csv" }, { status: 400 });
  }

  const stocks = await getStocksWithAnalysis(session.user.id);

  const lines: string[] = [HEADERS.join(",")];

  for (const stock of stocks) {
    const a = stock.analysis;

    // ── allHorizons ───────────────────────────────────────────────────────────
    let allH: AllHorizonsAIAnalysis | null = null;
    if (a?.allHorizons) {
      try { allH = JSON.parse(a.allHorizons) as AllHorizonsAIAnalysis; } catch { /* ignore */ }
    }

    const activeHorizonKey =
      stock.investmentHorizon === "MEDIUM_TERM" ? "mediumTerm" :
      stock.investmentHorizon === "LONG_TERM"   ? "longTerm"   : "shortTerm";
    const activeH = allH?.[activeHorizonKey];

    const scenarioLabel   = activeH?.scenarioLabel   ?? a?.scenarioLabel   ?? "";
    const confidenceScore = activeH?.prescriptiveAction?.confidenceScore ?? "";

    const shortTermLabel  = allH?.shortTerm?.scenarioLabel  ?? "";
    const mediumTermLabel = allH?.mediumTerm?.scenarioLabel ?? "";
    const longTermLabel   = allH?.longTerm?.scenarioLabel   ?? "";

    // ── metricsData ───────────────────────────────────────────────────────────
    type MetricsData = {
      short?:  { atr14?: number | null; relVolume?: number | null };
      medium?: Record<string, unknown>;
      long?:   Record<string, unknown>;
      sharpeRatio?:   number | null;
      kellyFraction?: number | null;
      garchVol?:      number | null;
      hurstExponent?: number | null;
    };
    let md: MetricsData = {};
    if (a?.metricsData) {
      try { md = JSON.parse(a.metricsData) as MetricsData; } catch { /* ignore */ }
    }

    const atr14          = md.short?.atr14     ?? "";
    const relativeVolume = md.short?.relVolume  ?? "";
    const hurstExponent  = md.hurstExponent     ?? "";
    const sharpeRatio    = md.sharpeRatio        ?? "";
    const kellyFraction  = md.kellyFraction      ?? "";
    const garchVol       = md.garchVol           ?? "";

    // ── divergenceAlert (PriceRsiDivergence | null after issue #50) ───────────
    const divergenceType = (a?.divergenceAlert as PriceRsiDivergence | null)?.type ?? "";

    // ── P&L ──────────────────────────────────────────────────────────────────
    const purchasePrice = stock.purchasePrice ?? "";
    const quantity      = stock.quantity      ?? "";
    const costBasis     = stock.purchasePrice != null && stock.quantity != null
      ? stock.purchasePrice * stock.quantity : "";
    const currentValue  = a?.price != null && stock.quantity != null
      ? a.price * stock.quantity : "";
    const pnlUsd        = typeof costBasis === "number" && typeof currentValue === "number"
      ? currentValue - costBasis : "";
    const pnlPct        = typeof pnlUsd === "number" && typeof costBasis === "number" && costBasis !== 0
      ? (pnlUsd / costBasis) * 100 : "";

    lines.push(row([
      stock.ticker,
      a?.price          ?? "",
      a?.changePercent  ?? "",
      scenarioLabel,
      confidenceScore,
      a?.rsi14          ?? "",
      a?.sma20          ?? "",
      a?.sma50          ?? "",
      atr14,
      relativeVolume,
      hurstExponent,
      shortTermLabel,
      "", "", "",   // shortTermProbPos/Neu/Neg — not in current data model
      mediumTermLabel,
      "", "", "",   // mediumTermProbPos/Neu/Neg
      longTermLabel,
      "", "", "",   // longTermProbPos/Neu/Neg
      sharpeRatio,
      kellyFraction,
      garchVol,
      divergenceType,
      purchasePrice,
      quantity,
      costBasis,
      currentValue,
      pnlUsd,
      typeof pnlPct === "number" ? pnlPct.toFixed(2) : "",
      a?.generatedAt ? new Date(a.generatedAt).toISOString() : "",
    ]));
  }

  const csv = lines.join("\r\n");
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="portfolio_${date}.csv"`,
    },
  });
}
