import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getStocksWithAnalysis } from "@/repositories/stockRepository";
import { getPortfolioAnalysis } from "@/repositories/portfolioAnalysisRepository";
import { getPortfolioMetrics, getTransactionHistory } from "@/services/transactionService";
import { prisma } from "@/lib/prisma";
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

  const [stocks, portfolioAnalysis, portfolioMetrics, sellHistory] = await Promise.all([
    getStocksWithAnalysis(session.user.id),
    getPortfolioAnalysis(session.user.id),
    prisma.stockAnalysis.findMany({
      where:  { stock: { userId: session.user.id } },
      select: { stockId: true, price: true },
    }).then(async (analyses) => {
      const currentPrices: Record<string, number> = {};
      for (const a of analyses) currentPrices[a.stockId] = a.price;
      return getPortfolioMetrics(session.user.id, currentPrices);
    }),
    getTransactionHistory(session.user.id),
  ]);

  const currentYear    = new Date().getFullYear();
  const realizedLosses = sellHistory.entries.filter(
    (e) => e.profitAmount < 0 && new Date(e.date).getFullYear() === currentYear
  );

  const openStocks     = stocks.filter((s) => s.quantity != null && s.quantity > 0);
  const historicStocks = stocks.filter((s) => s.quantity == null || s.quantity <= 0);

  const lastUpdatedAt = stocks
    .map((s) => s.analysis?.updatedAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0]
    ?.toISOString() ?? null;

  const stocksWithAnalysis = openStocks.filter((s) => s.analysis).length;

  return (
    <div className="space-y-6">
      <Disclaimer />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mis acciones</h1>
          <p className="text-sm text-gray-500">
            {openStocks.length} posiciones abiertas
            {historicStocks.length > 0 && (
              <span style={{ color: "var(--fg-5)", marginLeft: 6 }}>
                · {historicStocks.length} históricas en{" "}
                <a href="/dashboard/history" style={{ color: "var(--accent)", textDecoration: "underline" }}>
                  Historial
                </a>
              </span>
            )}
          </p>
        </div>
        <UpdateButton lastUpdatedAt={lastUpdatedAt} />
      </div>

      <PortfolioSummary stocks={stocks} realizedPnL={portfolioMetrics.totalRealizedPnL} />

      <PortfolioBenchmark stocks={stocks} />

      <TaxHarvestingPanel stocks={stocks} realizedLosses={realizedLosses} />

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
        {/* Solo posiciones activas consumen el límite (igual que stockService) */}
        <AddStockForm currentCount={stocks.filter((s) => s.quantity == null || s.quantity > 0).length} />
      </div>

      <TopMovers />

      {openStocks.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📈</p>
          <p className="text-sm">
            {historicStocks.length > 0
              ? `Tienes ${historicStocks.length} acciones históricas sin posición abierta. Añade una acción activa o consulta el Historial.`
              : "No tienes acciones añadidas. Añade hasta 20 para ver el análisis."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {openStocks.map((stock) => (
            <StockCard key={stock.id} stock={stock} />
          ))}
        </div>
      )}
    </div>
  );
}
