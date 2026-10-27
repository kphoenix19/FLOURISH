import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { openE2eDatabase, testDatabaseTarget } from "./database-safety";

async function main() {
let databaseUrl = "postgresql://disabled:disabled@127.0.0.1:1/flourish_e2e";
if (process.env.E2E_DATABASE_URL) {
  databaseUrl = testDatabaseTarget(process.env.E2E_DATABASE_URL, "e2e").connectionString;
  const pool = await openE2eDatabase();
  await pool.end();
}
// Even public smoke tests must never inherit the application DATABASE_URL/.env.
const child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3103"], {
  stdio: "inherit", env: { ...process.env, DATABASE_URL: databaseUrl }, windowsHide: true,
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
child.on("error", () => { process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });

}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Test infrastructure failed."); process.exitCode = 1; });
