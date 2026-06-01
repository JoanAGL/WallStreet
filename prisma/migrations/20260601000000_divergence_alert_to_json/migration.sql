-- Change divergenceAlert from BOOLEAN NOT NULL DEFAULT false to JSONB nullable.
-- Drop-and-recreate is necessary because PostgreSQL cannot cast BOOLEAN to JSONB implicitly.
-- Existing boolean values are discarded — they will be recalculated on the next analysis run.
ALTER TABLE "StockAnalysis" ALTER COLUMN "divergenceAlert" DROP DEFAULT;
ALTER TABLE "StockAnalysis" DROP COLUMN "divergenceAlert";
ALTER TABLE "StockAnalysis" ADD COLUMN "divergenceAlert" JSONB;
