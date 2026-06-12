-- Régimen de mercado combinado (issue #49): Hurst + GARCH + RSI + volumen.
ALTER TABLE "StockAnalysis" ADD COLUMN "marketRegime" TEXT;

-- Snapshots diarios del valor de cartera para la equity curve y el TWR.
CREATE TABLE "PortfolioSnapshot" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "date"       TIMESTAMP(3) NOT NULL,
    "totalValue" DOUBLE PRECISION NOT NULL,
    "costBasis"  DOUBLE PRECISION NOT NULL,
    "netFlows"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioSnapshot_userId_date_key" ON "PortfolioSnapshot"("userId", "date");
CREATE INDEX "PortfolioSnapshot_userId_date_idx" ON "PortfolioSnapshot"("userId", "date" DESC);

ALTER TABLE "PortfolioSnapshot" ADD CONSTRAINT "PortfolioSnapshot_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Misma política que el resto del esquema: RLS activado, sin políticas
-- (la app accede vía Prisma con el rol propietario; PostgREST bloqueado).
ALTER TABLE "PortfolioSnapshot" ENABLE ROW LEVEL SECURITY;
