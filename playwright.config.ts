import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { testDatabaseTarget } from "./tests/support/database-safety";

const authenticatedTests = Boolean(process.env.E2E_DATABASE_URL);
if (authenticatedTests) testDatabaseTarget(process.env.E2E_DATABASE_URL, "e2e");
const baseURL = "http://127.0.0.1:3103";
// Test-only code mints normal Auth.js encrypted cookies. The application has no bypass.
if (authenticatedTests) {
  // Workers reload this config; inherit one test-only key instead of rotating it.
  process.env.E2E_AUTH_SECRET ??= randomBytes(32).toString("hex");
  process.env.AUTH_SECRET = process.env.E2E_AUTH_SECRET;
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 1,
  retries: 0,
  reporter: "html",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "corepack pnpm exec tsx tests/support/e2e-server.ts",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    env: authenticatedTests ? {
      DATABASE_URL: process.env.E2E_DATABASE_URL!, AUTH_SECRET: process.env.AUTH_SECRET!,
      AUTH_GOOGLE_ID: "E2E_GOOGLE_CLIENT_ID", AUTH_GOOGLE_SECRET: "E2E_GOOGLE_CLIENT_SECRET", NEXTAUTH_URL: baseURL,
    } : { DATABASE_URL: "" },
    timeout: 120_000,
  },
});
