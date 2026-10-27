import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { openE2eDatabase, testDatabaseTarget } from "../tests/support/database-safety";

async function main() {
const target = testDatabaseTarget(process.env.E2E_DATABASE_URL, "e2e");
const pool = await openE2eDatabase();
await pool.end();
const require = createRequire(import.meta.url);
for (const args of [[join(dirname(require.resolve("prisma/package.json")), "build/index.js"), "migrate", "deploy"], [require.resolve("tsx/cli"), "prisma/seed.ts"]]) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env: { ...process.env, DATABASE_URL: target.connectionString }, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error("Disposable E2E preparation failed.");
}

}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Test infrastructure failed."); process.exitCode = 1; });
