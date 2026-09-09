import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";

const authenticatedTests = Boolean(process.env.E2E_DATABASE_URL);
const baseURL = "http://127.0.0.1:3103";
// Test-only code mints normal Auth.js encrypted cookies. The application has no bypass.
if (authenticatedTests) process.env.AUTH_SECRET ??= randomBytes(32).toString("hex");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "corepack pnpm exec next dev --hostname 127.0.0.1 --port 3103",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    env: authenticatedTests ? {
      DATABASE_URL: process.env.E2E_DATABASE_URL!, AUTH_SECRET: process.env.AUTH_SECRET!,
      AUTH_GOOGLE_ID: "E2E_GOOGLE_CLIENT_ID", AUTH_GOOGLE_SECRET: "E2E_GOOGLE_CLIENT_SECRET", NEXTAUTH_URL: baseURL,
    } : {},
    timeout: 120_000,
  },
});
