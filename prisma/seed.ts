import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { ZodError } from "zod";
import { loadCanonicalSeed } from "../src/modules/quests/seed/load";
import { validateCanonicalSeed } from "../src/modules/quests/seed/validate";
import { persistCanonicalSeed } from "../src/modules/quests/seed/persist";
import { seedReport } from "../src/modules/quests/seed/report";

async function main() {
  const seed = validateCanonicalSeed(loadCanonicalSeed());
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for db:seed (seed:validate works offline)");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const result = await persistCanonicalSeed(db, seed);
    console.log(seedReport(result.seed));
    console.log(`Deactivated: ${result.deactivatedQuests} quests, ${result.deactivatedFamilies} families, ${result.deactivatedTags} tags`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Avoid logging a connection string or raw Prisma invocation on operational failure.
  console.error(error instanceof ZodError || error instanceof Error && (error.message.startsWith("Canonical") || error.message.startsWith("DATABASE_URL")) ? error.message : "Canonical seed failed; no partial import committed. Check database availability, migrations, and unique constraints.");
  process.exitCode = 1;
});
