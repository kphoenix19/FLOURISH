import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { testDatabaseTarget, verifyTestDatabase } from "./database-safety";

export function testSchemaIdentifier(schema: string) {
  if (!/^flourish_it_[a-f0-9]{32}$/.test(schema)) throw new Error("Refusing an unowned test schema identifier.");
  return `"${schema}"`;
}

export function createIntegrationDatabase(value = process.env.TEST_DATABASE_URL) {
  const target = testDatabaseTarget(value, "integration");
  const schema = `flourish_it_${randomUUID().replaceAll("-", "")}`;
  const identifier = testSchemaIdentifier(schema);
  const control = new Pool({ connectionString: target.connectionString });
  const pool = new Pool({ connectionString: target.connectionString, options: `-c search_path=${schema}` });
  let created = false;
  let disposed = false;
  async function setup() {
    if (created || disposed) throw new Error("Test database lifecycle already started.");
    await verifyTestDatabase(control, target);
    await control.query(`CREATE SCHEMA ${identifier}`);
    created = true;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL search_path TO ${identifier}`);
      for (const name of readdirSync(resolve("prisma/migrations")).sort()) {
        if (/^\d/.test(name)) await client.query(readFileSync(resolve("prisma/migrations", name, "migration.sql"), "utf8"));
      }
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async function reset(tables: string[]) {
    if (!created || disposed || !tables.length || tables.some((table) => !/^[a-z_]+$/.test(table))) throw new Error("Unsafe fixture reset.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: [context] } = await client.query("SELECT current_schema() AS schema, current_database() AS database, current_user AS role");
      if (context.schema !== schema || context.database !== target.database || context.role !== target.role) throw new Error("Fixture connection escaped its owned schema.");
      const dependencies = await client.query(`WITH RECURSIVE affected(oid) AS (
        SELECT unnest($1::regclass[])::oid
        UNION SELECT c.conrelid FROM pg_constraint c JOIN affected a ON c.confrelid = a.oid WHERE c.contype = 'f'
      ) SELECT n.nspname AS schema, c.relname AS table FROM affected a JOIN pg_class c ON c.oid = a.oid
        JOIN pg_namespace n ON n.oid = c.relnamespace`, [tables.map((table) => `${identifier}."${table}"`)]);
      if (dependencies.rows.some((row) => row.schema !== schema)) throw new Error("Refusing a reset that would cascade into another schema.");
      // Explicitly enumerate the same-schema dependency closure, without CASCADE.
      // PostgreSQL RESTRICT also rejects a new external FK racing the check above.
      await client.query(`TRUNCATE TABLE ${dependencies.rows.map((row) => `${identifier}."${String(row.table).replaceAll('"', '""')}"`).join(", ")} RESTRICT`);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async function dispose() {
    if (disposed) return;
    if (created) {
      await verifyTestDatabase(control, target);
      const { rows: [owner] } = await control.query("SELECT pg_get_userbyid(nspowner) = current_user AS owned FROM pg_namespace WHERE nspname = $1", [schema]);
      if (!owner?.owned) throw new Error("Refusing cleanup of a missing or unowned schema.");
      const dependencies = await control.query(`SELECT 1 FROM pg_depend d
        CROSS JOIN LATERAL pg_identify_object(d.classid, d.objid, d.objsubid) dependent
        CROSS JOIN LATERAL pg_identify_object(d.refclassid, d.refobjid, d.refobjsubid) referenced
        WHERE d.deptype = 'n' AND referenced.schema = $1 AND dependent.schema IS NOT NULL
          AND dependent.schema <> $1 AND dependent.schema NOT LIKE 'pg_%' LIMIT 1`, [schema]);
      if (dependencies.rowCount) throw new Error("Refusing cleanup that would cascade into another schema.");
    }
    try {
      if (!pool.ended) await pool.end();
      if (created) {
        await control.query(`DROP SCHEMA ${identifier} CASCADE`);
        created = false;
      }
    } finally { disposed = true; await control.end(); }
  }
  return { schema, pool, setup, reset, dispose };
}
