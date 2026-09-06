import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required to create the Prisma client.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type TransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];
