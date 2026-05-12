-- CreateEnum
CREATE TYPE "InvestmentHorizon" AS ENUM ('SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM');

-- AlterTable Stock
ALTER TABLE "Stock" ADD COLUMN "investmentHorizon" "InvestmentHorizon" NOT NULL DEFAULT 'SHORT_TERM';

-- AlterTable StockAnalysis
ALTER TABLE "StockAnalysis" ADD COLUMN "horizonMatch" TEXT;
ALTER TABLE "StockAnalysis" ADD COLUMN "keyMetrics"   TEXT;
ALTER TABLE "StockAnalysis" ADD COLUMN "metricsData"  TEXT;
