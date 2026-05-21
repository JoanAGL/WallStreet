-- CreateTable: shared persistent cache for serverless environments
CREATE TABLE "CacheEntry" (
    "key"       TEXT         NOT NULL,
    "value"     TEXT         NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CacheEntry_pkey" PRIMARY KEY ("key")
);
