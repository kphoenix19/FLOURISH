import { describe, expect, it } from "vitest";
import { createIntegrationDatabase } from "../support/integration-database";

describe("disposable database isolation", () => {
  it("migrates, resets only its own schema, and removes only that schema on cleanup", async () => {
    const a = createIntegrationDatabase(); const b = createIntegrationDatabase();
    try {
      await a.setup(); await b.setup();
      for (const fixture of [a, b]) await fixture.pool.query("INSERT INTO users (id, email, updated_at) VALUES (gen_random_uuid(), 'sentinel@example.test', now())");
      await a.reset(["users"]);
      expect((await a.pool.query("SELECT count(*)::int AS count FROM users")).rows[0].count).toBe(0);
      expect((await b.pool.query("SELECT count(*)::int AS count FROM users")).rows[0].count).toBe(1);
      await a.dispose(); await a.dispose();
      expect((await b.pool.query("SELECT 1 FROM pg_namespace WHERE nspname = $1", [a.schema])).rowCount).toBe(0);
      expect((await b.pool.query("SELECT count(*)::int AS count FROM users")).rows[0].count).toBe(1);
    } finally { await a.dispose(); await b.dispose(); }
  });
  it("rejects a reset after search_path drift before truncating either schema", async () => {
    const a = createIntegrationDatabase(); const b = createIntegrationDatabase();
    try {
      await a.setup(); await b.setup();
      await b.pool.query("INSERT INTO users (id, email, updated_at) VALUES (gen_random_uuid(), 'keep@example.test', now())");
      await a.pool.query(`SET search_path TO "${b.schema}"`);
      await expect(a.reset(["users"])).rejects.toThrow("escaped its owned schema");
      expect((await b.pool.query("SELECT count(*)::int AS count FROM users")).rows[0].count).toBe(1);
      await expect(a.reset(["public.users"])).rejects.toThrow("Unsafe fixture reset");
    } finally { await a.dispose(); await b.dispose(); }
  });
  it("cannot mutate the guard or public schema even with explicit SQL", async () => {
    const fixture = createIntegrationDatabase();
    try {
      await fixture.setup();
      for (const sql of ["TRUNCATE test_guard.disposable_target CASCADE", "DELETE FROM test_guard.disposable_target", "DROP SCHEMA public CASCADE", "CREATE TABLE public.accidental_write (id int)"]) {
        await expect(fixture.pool.query(sql)).rejects.toMatchObject({ code: "42501" });
      }
      expect((await fixture.pool.query("SELECT count(*)::int AS count FROM test_guard.disposable_target")).rows[0].count).toBe(1);
    } finally { await fixture.dispose(); }
  });
  it("refuses cross-schema CASCADE effects for both reset and teardown", async () => {
    const a = createIntegrationDatabase(); const b = createIntegrationDatabase();
    try {
      await a.setup(); await b.setup();
      await b.pool.query(`CREATE TABLE external_reference (id uuid REFERENCES "${a.schema}".users(id))`);
      await expect(a.reset(["users"])).rejects.toThrow("cascade into another schema");
      await expect(a.dispose()).rejects.toThrow("cascade into another schema");
      expect((await b.pool.query("SELECT 1 FROM pg_constraint WHERE conrelid = 'external_reference'::regclass AND contype = 'f'")).rowCount).toBe(1);
      await b.dispose(); await a.dispose();
    } finally { await b.dispose(); await a.dispose(); }
  });
  it("cleans up an owned schema after a migration/setup failure", async () => {
    const fixture = createIntegrationDatabase(); const observer = createIntegrationDatabase();
    try {
      // A disconnected fixture pool forces setup to fail after schema creation.
      await fixture.pool.end();
      await expect(fixture.setup()).rejects.toThrow();
      await observer.setup();
      await fixture.dispose();
      expect((await observer.pool.query("SELECT 1 FROM pg_namespace WHERE nspname = $1", [fixture.schema])).rowCount).toBe(0);
    } finally { await fixture.dispose(); await observer.dispose(); }
  });
});
