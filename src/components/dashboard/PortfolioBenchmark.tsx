import { fetchYahooCandles } from "@/lib/yahooFinanceClient";
import type { StockWithAnalysis } from "@/types/models";

interface Props { stocks: StockWithAnalysis[] }

export default async function PortfolioBenchmark({ stocks }: Props) {
  const withPosition = stocks.filter(
    (s) => s.purchasePrice != null && s.quantity != null && s.purchaseDate != null && s.analysis
  );
  if (withPosition.length === 0) return null;

  const oldestDate = withPosition.reduce<Date>((min, s) => {
    const d = new Date(s.purchaseDate!);
    return d < min ? d : min;
  }, new Date(withPosition[0].purchaseDate!));

  const daysSince = Math.ceil((Date.now() - oldestDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSince < 2) return null;

  try {
    const candles = await fetchYahooCandles("SPY", Math.min(daysSince + 5, 365));
    if (candles.closes.length < 2) return null;

    // SPY return over the period
    const spyStart = candles.closes[candles.closes.length - 1]; // oldest (array is reversed: [0]=newest)
    const spyEnd   = candles.closes[0];
    const spyReturn = ((spyEnd - spyStart) / spyStart) * 100;

    // Portfolio return (cost-weighted)
    const totalCost  = withPosition.reduce((s, p) => s + p.purchasePrice! * p.quantity!, 0);
    const totalValue = withPosition.reduce((s, p) => s + (p.analysis?.price ?? 0) * p.quantity!, 0);
    const portReturn = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : null;

    if (portReturn === null) return null;

    const diff    = portReturn - spyReturn;
    const beating = diff >= 0;
    const sinceStr = oldestDate.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });

    return (
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 space-y-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Tu cartera vs S&amp;P 500 (SPY) · desde {sinceStr}
        </p>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-gray-600">
            Tu cartera: <span className={`font-semibold ${portReturn >= 0 ? "text-green-600" : "text-red-600"}`}>
              {portReturn >= 0 ? "+" : ""}{portReturn.toFixed(2)}%
            </span>
          </span>
          <span className="text-gray-600">
            SPY: <span className={`font-semibold ${spyReturn >= 0 ? "text-green-600" : "text-red-600"}`}>
              {spyReturn >= 0 ? "+" : ""}{spyReturn.toFixed(2)}%
            </span>
          </span>
          <span className={`font-semibold text-xs px-2.5 py-0.5 rounded-full border ${
            beating
              ? "text-green-700 bg-green-50 border-green-200"
              : "text-red-700 bg-red-50 border-red-200"
          }`}>
            {beating ? `+${diff.toFixed(2)}% vs mercado` : `${diff.toFixed(2)}% vs mercado`}
          </span>
        </div>
        <p className="text-xs text-gray-400">Comparativa informativa · no incluye dividendos ni splits</p>
      </div>
    );
  } catch {
    return null;
  }
}
