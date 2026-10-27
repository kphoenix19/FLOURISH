import { Pool, type PoolClient } from "pg";

export type TestDatabaseKind = "integration" | "e2e";
export function testDatabaseTarget(value: string | undefined, kind: TestDatabaseKind) {
  const variable = kind === "integration" ? "TEST_DATABASE_URL" : "E2E_DATABASE_URL";
  if (!value) throw new Error(`${variable} is required; application DATABASE_URL is never used for tests.`);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${variable} must be a disposable PostgreSQL URL.`); }
  const expectedDatabase = kind === "integration" ? "flourish_test" : "flourish_e2e";
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || url.pathname !== `/${expectedDatabase}` || url.username !== "flourish_test"
    || !url.password || url.search || url.hash) {
    throw new Error(`${variable} must use local ${expectedDatabase}, role flourish_test, and no URL options.`);
  }
  return { connectionString: url.toString(), database: expectedDatabase, role: "flourish_test", kind };
}

// This check is read-only. Provisioning, migrations and fixture writes must follow it.
export async function verifyTestDatabase(client: Pool | PoolClient, target: ReturnType<typeof testDatabaseTarget>) {
  const { rows: [identity] } = await client.query(`SELECT current_database() AS database, current_user AS role,
    r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls,
    pg_get_userbyid(d.datdba) = current_user AS owns_database,
    EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid) AS memberships
    FROM pg_roles r JOIN pg_database d ON d.datname = current_database() WHERE r.rolname = current_user`);
  if (!identity || identity.database !== target.database || identity.role !== target.role
    || identity.rolsuper || identity.rolcreatedb || identity.rolcreaterole || identity.rolreplication
    || identity.rolbypassrls || identity.owns_database || identity.memberships) {
    throw new Error("Unsafe test database identity or privileges; use the restricted disposable test role.");
  }
  const { rows: [marker] } = await client.query("SELECT database_name, role_name, kind FROM test_guard.disposable_target");
  if (!marker || marker.database_name !== target.database || marker.role_name !== target.role || marker.kind !== target.kind) {
    throw new Error("Database is not provisioned as the requested disposable test target.");
  }
  const { rows: [permissions] } = await client.query(`SELECT
    has_schema_privilege(current_user, 'test_guard', 'CREATE') AS guard_create,
    has_table_privilege(current_user, 'test_guard.disposable_target', 'INSERT,UPDATE,DELETE,TRUNCATE') AS guard_write,
    has_schema_privilege(current_user, 'public', 'CREATE') AS public_create,
    has_schema_privilege(current_user, 'public', 'USAGE') AS public_usage`);
  if (permissions.guard_create || permissions.guard_write
    || (target.kind === "integration" && (permissions.public_create || permissions.public_usage))) {
    throw new Error("Test role can access protected schemas; refusing fixture operations.");
  }
}

export async function openE2eDatabase() {
  const target = testDatabaseTarget(process.env.E2E_DATABASE_URL, "e2e");
  const pool = new Pool({ connectionString: target.connectionString, options: "-c search_path=public" });
  try { await verifyTestDatabase(pool, target); return pool; }
  catch (error) { await pool.end(); throw error; }
}
