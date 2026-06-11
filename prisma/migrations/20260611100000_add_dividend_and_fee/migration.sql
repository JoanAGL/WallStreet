-- DIVIDEND: shares × price = importe bruto del dividendo; fee = retención.
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'DIVIDEND';

-- Comisión de la operación (BUY/SELL) o retención (DIVIDEND), en USD.
ALTER TABLE "Transaction" ADD COLUMN "fee" DOUBLE PRECISION NOT NULL DEFAULT 0;
