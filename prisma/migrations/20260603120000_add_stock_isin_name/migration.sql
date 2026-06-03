-- Add ISIN and name fields to Stock for DEGIRO import support
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "isin" TEXT;
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "name" TEXT;

-- Mark migration as applied (run this in Supabase SQL Editor if Prisma deploy fails with P3009)
-- UPDATE "_prisma_migrations" SET finished_at=NOW(), logs=NULL, rolled_back_at=NULL
-- WHERE migration_name='20260603120000_add_stock_isin_name' AND finished_at IS NULL;
