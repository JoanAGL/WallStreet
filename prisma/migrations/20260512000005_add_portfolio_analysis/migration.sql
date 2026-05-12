CREATE TABLE IF NOT EXISTS "PortfolioAnalysis" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "analysisJson" TEXT NOT NULL,
    "stockCount"   INTEGER NOT NULL,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PortfolioAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PortfolioAnalysis_userId_key" ON "PortfolioAnalysis"("userId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortfolioAnalysis_userId_fkey'
  ) THEN
    ALTER TABLE "PortfolioAnalysis"
      ADD CONSTRAINT "PortfolioAnalysis_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
