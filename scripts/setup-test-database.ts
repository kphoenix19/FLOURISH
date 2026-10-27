import { Pool } from "pg";
import { testDatabaseTarget, type TestDatabaseKind } from "../tests/support/database-safety";

async function main() {
// Provision only a fresh, explicitly named disposable DB. Never load application .env.
const kind: TestDatabaseKind = process.argv.includes("--e2e") ? "e2e" : "integration";
const target = testDatabaseTarget(kind === "e2e" ? process.env.E2E_DATABASE_URL : process.env.TEST_DATABASE_URL, kind);
const adminValue = process.env.TEST_DATABASE_ADMIN_URL;
if (!adminValue) throw new Error("TEST_DATABASE_ADMIN_URL is required for disposable provisioning only.");
const adminUrl = new URL(adminValue);
const testUrl = new URL(target.connectionString);
if (adminUrl.hostname !== testUrl.hostname || adminUrl.port !== testUrl.port || adminUrl.pathname !== testUrl.pathname
  || !["postgres:", "postgresql:"].includes(adminUrl.protocol) || adminUrl.search || adminUrl.hash) throw new Error("Provisioning URL must target the same local disposable database without options.");
const pool = new Pool({ connectionString: adminUrl.toString() });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const { rows: [identity] } = await client.query("SELECT current_database() AS database, current_user AS role");
  if (identity.database !== target.database || identity.role === target.role) throw new Error("Wrong provisioning connection.");
  const existing = await client.query("SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public', 'information_schema') AND nspname NOT LIKE 'pg_%' UNION ALL SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace LIMIT 1");
  if (existing.rowCount) throw new Error("Refusing to provision a nonempty database; use a fresh disposable instance.");
  const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [target.role]);
  if (role.rowCount) throw new Error("Test role already exists; use a fresh disposable PostgreSQL instance.");
  const { rows: [literal] } = await client.query("SELECT quote_literal($1) AS password", [decodeURIComponent(testUrl.password)]);
  await client.query(`CREATE ROLE flourish_test LOGIN PASSWORD ${literal.password} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await client.query(`REVOKE ALL ON DATABASE "${target.database}" FROM PUBLIC`);
  await client.query(`GRANT CONNECT, CREATE ON DATABASE "${target.database}" TO flourish_test`);
  await client.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
  if (kind === "e2e") await client.query("GRANT USAGE, CREATE ON SCHEMA public TO flourish_test");
  await client.query("CREATE SCHEMA test_guard");
  await client.query("CREATE TABLE test_guard.disposable_target (database_name text NOT NULL, role_name text NOT NULL, kind text NOT NULL)");
  await client.query("INSERT INTO test_guard.disposable_target VALUES ($1, $2, $3)", [target.database, target.role, kind]);
  await client.query("GRANT USAGE ON SCHEMA test_guard TO flourish_test");
  await client.query("GRANT SELECT ON test_guard.disposable_target TO flourish_test");
  await client.query("COMMIT");
  process.stdout.write(`Provisioned restricted ${kind} test infrastructure.\n`);
} catch (error) { await client.query("ROLLBACK"); throw error; }
finally { client.release(); await pool.end(); }

}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Test infrastructure failed."); process.exitCode = 1; });
