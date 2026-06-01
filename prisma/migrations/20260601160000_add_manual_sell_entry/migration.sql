-- CreateTable
CREATE TABLE IF NOT EXISTS "ManualSellEntry" (
    "id"               TEXT NOT NULL,
    "userId"           TEXT NOT NULL,
    "ticker"           TEXT NOT NULL,
    "shares"           DOUBLE PRECISION NOT NULL,
    "avgBuyPrice"      DOUBLE PRECISION NOT NULL,
    "sellPrice"        DOUBLE PRECISION NOT NULL,
    "investedAmount"   DOUBLE PRECISION NOT NULL,
    "revenueAmount"    DOUBLE PRECISION NOT NULL,
    "profitAmount"     DOUBLE PRECISION NOT NULL,
    "profitPercentage" DOUBLE PRECISION NOT NULL,
    "date"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes"            TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualSellEntry_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ManualSellEntry" ADD CONSTRAINT "ManualSellEntry_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ManualSellEntry_userId_date_idx" ON "ManualSellEntry"("userId", "date" DESC);
