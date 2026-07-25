import * as schema from "./schema";

// In-memory SQLite fallback for local development (Node.js).
// In production, the @cloudflare/vite-plugin resolves the D1 binding
// from import("cloudflare:workers") — this code path never runs there.

let _devDb: ReturnType<typeof import("drizzle-orm/better-sqlite3").drizzle> | null = null;

async function getDevDb() {
  if (_devDb) return _devDb;

  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const Database = (await import("better-sqlite3")).default as new (path: string) => import("better-sqlite3").Database;
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      problem_id TEXT NOT NULL,
      problem_title TEXT NOT NULL,
      status TEXT NOT NULL,
      passed TEXT NOT NULL,
      source_code TEXT NOT NULL,
      submitted_at TEXT NOT NULL
    )
  `);

  _devDb = drizzle(sqlite, { schema });
  return _devDb;
}

export function getDb() {
  return getDevDb();
}
