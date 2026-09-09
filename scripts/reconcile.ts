import "dotenv/config";
import { getDb } from "../src/lib/db";
import { runGameStateReconciliation } from "../src/modules/jobs/reconciliation";

async function main() {
  const db = getDb();
  try {
    const result = await runGameStateReconciliation(db);
    console.log(JSON.stringify(result));
    if (result.failures.length) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ job: "game-state-reconciliation", completed: false, error: error instanceof Error ? error.name : "UnknownError" }));
  process.exitCode = 1;
});
