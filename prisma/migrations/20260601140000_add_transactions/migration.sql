-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('BUY', 'SELL');

-- CreateTable
CREATE TABLE "Transaction" (
    "id"        TEXT             NOT NULL,
    "stockId"   TEXT             NOT NULL,
    "type"      "TransactionType" NOT NULL,
    "shares"    DOUBLE PRECISION NOT NULL,
    "price"     DOUBLE PRECISION NOT NULL,
    "date"      TIMESTAMP(3),
    "notes"     TEXT,
    "createdAt" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_stockId_fkey"
    FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Transaction_stockId_createdAt_idx" ON "Transaction"("stockId", "createdAt" DESC);
