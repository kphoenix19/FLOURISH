import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { openE2eDatabase, testDatabaseTarget } from "./database-safety";

async function main() {
let databaseUrl = "postgresql://disabled:disabled@127.0.0.1:1/flourish_e2e";
if (process.env.E2E_DATABASE_URL) {
  databaseUrl = testDatabaseTarget(process.env.E2E_DATABASE_URL, "e2e").connectionString;
  const pool = await openE2eDatabase();
  await pool.end();
}
// Validate before either process starts. Never inherit application DB/OAuth values,
// including for smoke-only runs. Production compilation happens before readiness,
// not inside a browser assertion. Next keeps the existing dev server in .next/dev.
const env: NodeJS.ProcessEnv = {
  ...process.env, NODE_ENV: "production", DATABASE_URL: databaseUrl,
  AUTH_SECRET: process.env.E2E_DATABASE_URL ? process.env.AUTH_SECRET! : randomBytes(32).toString("hex"),
  AUTH_GOOGLE_ID: "E2E_GOOGLE_CLIENT_ID", AUTH_GOOGLE_SECRET: "E2E_GOOGLE_CLIENT_SECRET",
  NEXTAUTH_URL: "http://127.0.0.1:3103",
};
let child: ReturnType<typeof spawn> | undefined;
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { stopping = true; child?.kill(signal); });
const run = (args: string[]) => new Promise<number>((resolveExit, reject) => {
  const processChild = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), ...args], {
    stdio: "inherit", env, windowsHide: true,
  });
  child = processChild;
  processChild.on("error", reject);
  processChild.on("exit", (code) => resolveExit(code ?? 1));
});
const build = await run(["build"]);
if (build !== 0 || stopping) { process.exitCode = build || 1; return; }
process.exitCode = await run(["start", "--hostname", "127.0.0.1", "--port", "3103"]);

}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Test infrastructure failed."); process.exitCode = 1; });
