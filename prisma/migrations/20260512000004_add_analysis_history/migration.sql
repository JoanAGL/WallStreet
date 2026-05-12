CREATE TABLE "StockAnalysisHistory" (
  "id"            TEXT        NOT NULL,
  "stockId"       TEXT        NOT NULL,
  "snapshotAt"    TIMESTAMP   NOT NULL DEFAULT NOW(),
  "price"         DOUBLE PRECISION NOT NULL,
  "changePercent" DOUBLE PRECISION NOT NULL,
  "scenarioLabel" TEXT        NOT NULL,
  "horizonUsed"   TEXT        NOT NULL,
  "rsi14"         DOUBLE PRECISION,
  CONSTRAINT "StockAnalysisHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockAnalysisHistory_stockId_fkey"
    FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE
);

CREATE INDEX "StockAnalysisHistory_stockId_snapshotAt_idx"
  ON "StockAnalysisHistory"("stockId", "snapshotAt" DESC);
