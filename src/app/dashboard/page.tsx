import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getStocksWithAnalysis } from "@/repositories/stockRepository";
import { getPortfolioAnalysis } from "@/repositories/portfolioAnalysisRepository";
import StockCard from "@/components/dashboard/StockCard";
import AddStockForm from "@/components/dashboard/AddStockForm";
import UpdateButton from "@/components/dashboard/UpdateButton";
import Disclaimer from "@/components/ui/Disclaimer";
import PortfolioSummary from "@/components/dashboard/PortfolioSummary";
import PortfolioAIInsights from "@/components/dashboard/PortfolioAIInsights";
import PortfolioBenchmark from "@/components/dashboard/PortfolioBenchmark";
import TopMovers from "@/components/dashboard/TopMovers";
import CorrelationMatrix from "@/components/dashboard/CorrelationMatrix";
import TaxHarvestingPanel from "@/components/dashboard/TaxHarvestingPanel";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [stocks, portfolioAnalysis] = await Promise.all([
    getStocksWithAnalysis(session.user.id),
    getPortfolioAnalysis(session.user.id),
  ]);

  // Active = quantity IS NULL (manually added, no WAC data yet) OR quantity > 0 (open position).
  // Stocks with quantity = 0 are fully sold (set by the importer) — hide from dashboard.
  const activeStocks = stocks.filter((s) => s.quantity !== 0);

  const lastUpdatedAt = activeStocks
    .map((s) => s.analysis?.updatedAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0]
    ?.toISOString() ?? null;

  const stocksWithAnalysis = activeStocks.filter((s) => s.analysis).length;

  return (
    <div className="space-y-6">
      <Disclaimer />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mis acciones</h1>
          <p className="text-sm text-gray-500">
            {activeStocks.length} / 20 posiciones activas
            {stocks.length > activeStocks.length && (
              <span style={{ color: "var(--fg-5)" }}>
                {" "}· {stocks.length - activeStocks.length} cerradas (ocultas)
              </span>
            )}
          </p>
        </div>
        <UpdateButton lastUpdatedAt={lastUpdatedAt} />
      </div>

      <PortfolioSummary stocks={activeStocks} />

      <PortfolioBenchmark stocks={activeStocks} />

      <TaxHarvestingPanel stocks={activeStocks} />

      {stocksWithAnalysis >= 2 && <CorrelationMatrix />}

      {portfolioAnalysis && stocksWithAnalysis >= 2 && (
        <PortfolioAIInsights
          analysisJson={portfolioAnalysis.analysisJson}
          stockCount={portfolioAnalysis.stockCount}
          updatedAt={portfolioAnalysis.updatedAt}
        />
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <p className="text-sm font-medium text-gray-700 mb-3">
          Añadir acción (NYSE / NASDAQ)
        </p>
        <AddStockForm currentCount={activeStocks.length} />
      </div>

      <TopMovers />

      {activeStocks.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📈</p>
          <p className="text-sm">
            No tienes posiciones activas. Añade acciones o importa tu cartera desde DEGIRO.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {activeStocks.map((stock) => (
            <StockCard key={stock.id} stock={stock} />
          ))}
        </div>
      )}
    </div>
  );
}
