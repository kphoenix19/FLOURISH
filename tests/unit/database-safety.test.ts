import { afterEach, describe, expect, it, vi } from "vitest";
import { testDatabaseTarget, verifyTestDatabase } from "../support/database-safety";
import { createIntegrationDatabase, testSchemaIdentifier } from "../support/integration-database";
import type { Pool } from "pg";

const safe = "postgresql://flourish_test:disposable@127.0.0.1:55439/flourish_test";
afterEach(() => vi.unstubAllEnvs());
describe("test database safeguards", () => {
  it("does not fall back to the application URL when test configuration is missing", () => {
    vi.stubEnv("TEST_DATABASE_URL", undefined);
    vi.stubEnv("DATABASE_URL", "postgresql://app:secret@localhost/flourish");
    expect(() => createIntegrationDatabase()).toThrow("TEST_DATABASE_URL is required");
    expect(() => testDatabaseTarget(undefined, "e2e")).toThrow("E2E_DATABASE_URL is required");
  });
  it.each([
    "postgresql://app:secret@localhost/flourish",
    "postgresql://flourish_test:disposable@localhost/flourish",
    "postgresql://postgres:disposable@localhost/flourish_test",
    "postgresql://flourish_test:disposable@production.example/flourish_test",
    `${safe}?options=-c%20search_path%3Dpublic`, `${safe}?host=production.example`,
    `${safe}?schema=public`, `${safe}#public`, "not-a-url", "",
  ])("rejects an unsafe target before a pool is constructed (%s)", (url) => {
    expect(() => createIntegrationDatabase(url)).toThrow();
  });
  it("accepts only the explicit integration or E2E database for its purpose", () => {
    expect(testDatabaseTarget(safe, "integration").database).toBe("flourish_test");
    expect(() => testDatabaseTarget(safe, "e2e")).toThrow();
    expect(testDatabaseTarget(safe.replace(/flourish_test$/, "flourish_e2e"), "e2e").database).toBe("flourish_e2e");
  });
  it.each(["public", "app", "flourish_it_x", 'flourish_it_";DROP SCHEMA public CASCADE;--']) ("rejects unsafe schema identifiers (%s)", (schema) => {
    expect(() => testSchemaIdentifier(schema)).toThrow();
  });
  it.each(["rolsuper", "rolcreatedb", "rolcreaterole", "rolreplication", "rolbypassrls", "owns_database", "memberships"])("rejects elevated %s using read-only checks", async (privilege) => {
    const query = vi.fn().mockResolvedValue({ rows: [{ database: "flourish_test", role: "flourish_test", [privilege]: true }] });
    await expect(verifyTestDatabase({ query } as unknown as Pool, testDatabaseTarget(safe, "integration"))).rejects.toThrow("Unsafe test database");
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toMatch(/^SELECT/);
  });
  it("rejects a missing or wrong provisioning marker without writing", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ database: "flourish_test", role: "flourish_test" }] }).mockResolvedValueOnce({ rows: [] });
    await expect(verifyTestDatabase({ query } as unknown as Pool, testDatabaseTarget(safe, "integration"))).rejects.toThrow("not provisioned");
    expect(query.mock.calls.every(([sql]) => sql.startsWith("SELECT"))).toBe(true);
  });
  it("rejects an integration role with public-schema access", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ database: "flourish_test", role: "flourish_test" }] })
      .mockResolvedValueOnce({ rows: [{ database_name: "flourish_test", role_name: "flourish_test", kind: "integration" }] })
      .mockResolvedValueOnce({ rows: [{ public_usage: true }] });
    await expect(verifyTestDatabase({ query } as unknown as Pool, testDatabaseTarget(safe, "integration"))).rejects.toThrow("protected schemas");
  });
});
