import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required to create the Prisma client.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Lazy construction keeps builds and public pages independent of database credentials.
export function getDb() {
  return globalForPrisma.prisma ??= createPrismaClient();
}
export type TransactionClient = Prisma.TransactionClient;
