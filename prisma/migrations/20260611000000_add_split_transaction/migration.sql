-- Añade SPLIT al enum de tipos de transacción.
-- PG 12+ permite ALTER TYPE ... ADD VALUE dentro de transacción siempre que
-- el nuevo valor no se use en la misma transacción.
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'SPLIT';
