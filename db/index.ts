import * as schema from "./schema";

// In production (Cloudflare Workers), the real D1 binding is injected.
// In local dev mode, we use better-sqlite3 in-memory because
// cloudflare:workers is not available in Node.js.

let _devDb: ReturnType<typeof import("drizzle-orm/better-sqlite3").drizzle> | null = null;

async function getDevDb() {
  if (_devDb) return _devDb;

  const Database = (await import("better-sqlite3")).default;
  const { drizzle } = await import("drizzle-orm/better-sqlite3");

  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, problem_id TEXT NOT NULL, problem_title TEXT NOT NULL, status TEXT NOT NULL, passed TEXT NOT NULL, source_code TEXT NOT NULL, submitted_at TEXT NOT NULL);`);

  _devDb = drizzle(sqlite, { schema });
  return _devDb;
}

export function getDb() {
  // Try Cloudflare Workers binding. Uses a non-analyzable import path
  // (concatenated string) so Vite's dependency scanner skips it in dev mode.
  const cfMod = "cloudflare:" + "workers";
  return import(cfMod)
    .then(({ env }) => {
      if (env?.DB) return import("drizzle-orm/d1").then(({ drizzle }) => drizzle(env.DB as D1Database, { schema }));
      return getDevDb();
    })
    .catch(() => getDevDb());
}
