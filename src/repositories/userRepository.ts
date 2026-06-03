import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

export async function findUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } });
}

export async function createUser(data: {
  email: string;
  password: string;
  name?: string;
}): Promise<Omit<User, "password">> {
  return prisma.user.create({
    data,
    select: {
      id: true,
      email: true,
      name: true,
      lastLogin: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
