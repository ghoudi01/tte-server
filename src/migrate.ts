import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import type { Pool } from "pg";

const MIGRATIONS_DIR = resolve(process.cwd(), "database", "migrations");

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
    )
  `);

  let files: string[] = [];
  try {
    files = readdirSync(MIGRATIONS_DIR)
      .filter((f: string) => f.endsWith(".sql"))
      .sort();
  } catch {
    return;
  }

  const { rows: applied } = await pool.query<{ name: string }>(
    `SELECT name FROM _migrations ORDER BY name`
  );
  const appliedSet = new Set(applied.map((r: { name: string }) => r.name));

  for (const file of files) {
    if (appliedSet.has(file)) continue;

    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const statements = sql
      .split(";")
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);

    for (const stmt of statements) {
      await pool.query(stmt);
    }

    await pool.query(`INSERT INTO _migrations (name) VALUES ($1)`, [file]);
    console.log(`[migrate] applied ${file}`);
  }
}
