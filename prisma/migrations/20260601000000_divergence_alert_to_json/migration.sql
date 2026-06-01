-- Change divergenceAlert from BOOLEAN NOT NULL DEFAULT false to JSONB nullable.
-- Existing rows are set to NULL (no divergence data — will be recalculated on next analysis run).
ALTER TABLE "StockAnalysis" ALTER COLUMN "divergenceAlert" DROP DEFAULT;
ALTER TABLE "StockAnalysis" ALTER COLUMN "divergenceAlert" TYPE JSONB USING NULL;
