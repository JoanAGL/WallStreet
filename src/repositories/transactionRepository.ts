import { prisma } from "@/lib/prisma";

// SPLIT: ajuste por split/contrasplit — `shares` guarda el factor (10 para
// 10:1, 0.1 para 1:10) y `price` se almacena como 1 (sin significado).
// DIVIDEND: `shares` × `price` = importe bruto del dividendo; `fee` = retención.
export type TransactionType = "BUY" | "SELL" | "SPLIT" | "DIVIDEND";

export interface TransactionData {
  stockId: string;
  type:    TransactionType;
  shares:  number;
  price:   number;
  fee?:    number;          // comisión (BUY/SELL) o retención (DIVIDEND), USD
  date?:   Date | null;
  notes?:  string | null;
}

export interface TransactionRecord {
  id:        string;
  stockId:   string;
  type:      TransactionType;
  shares:    number;
  price:     number;
  fee:       number;
  date:      Date | null;
  notes:     string | null;
  createdAt: Date;
}

export async function createTransaction(
  data: TransactionData
): Promise<TransactionRecord> {
  return prisma.transaction.create({ data }) as unknown as TransactionRecord;
}

export async function getTransactionsByStock(
  stockId: string
): Promise<TransactionRecord[]> {
  return prisma.transaction.findMany({
    where:   { stockId },
    orderBy: { createdAt: "asc" },
  }) as unknown as TransactionRecord[];
}

export async function getTransactionsByUser(
  userId: string
): Promise<TransactionRecord[]> {
  return prisma.transaction.findMany({
    where:   { stock: { userId } },
    orderBy: { createdAt: "asc" },
  }) as unknown as TransactionRecord[];
}

export async function findTransactionByIdAndUser(
  id:     string,
  userId: string
): Promise<TransactionRecord | null> {
  return prisma.transaction.findFirst({
    where: { id, stock: { userId } },
  }) as unknown as TransactionRecord | null;
}

export async function updateTransaction(
  id:   string,
  data: Partial<Omit<TransactionData, "stockId">>
): Promise<TransactionRecord> {
  return prisma.transaction.update({
    where: { id },
    data,
  }) as unknown as TransactionRecord;
}

export async function deleteTransaction(id: string): Promise<void> {
  await prisma.transaction.delete({ where: { id } });
}
