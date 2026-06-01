-- CreateTable: ClosedOperation — persists each sell transaction that closes a position.
CREATE TABLE "ClosedOperation" (
    "id"               TEXT         NOT NULL,
    "stockId"          TEXT         NOT NULL,
    "ticker"           TEXT         NOT NULL,
    "shares"           DOUBLE PRECISION NOT NULL,
    "buyPrice"         DOUBLE PRECISION NOT NULL,
    "sellPrice"        DOUBLE PRECISION NOT NULL,
    "investedAmount"   DOUBLE PRECISION NOT NULL,
    "revenueAmount"    DOUBLE PRECISION NOT NULL,
    "profitAmount"     DOUBLE PRECISION NOT NULL,
    "profitPercentage" DOUBLE PRECISION NOT NULL,
    "closedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClosedOperation_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ClosedOperation" ADD CONSTRAINT "ClosedOperation_stockId_fkey"
    FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ClosedOperation_stockId_closedAt_idx" ON "ClosedOperation"("stockId", "closedAt" DESC);
