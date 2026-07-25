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
  // Local Vite dev runs in Node.js, where the Workers virtual module does not
  // exist. Return the in-memory SQLite fallback directly so dependency
  // pre-bundling never tries to resolve `cloudflare:workers`.
  if (import.meta.env.DEV) return getDevDb();

  // Production runs inside Cloudflare Workers. Keep the import opaque so Vite's
  // dependency scanner does not try to pre-bundle the virtual module locally.
  const runtimeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<{ env?: { DB?: D1Database } }>;
  return runtimeImport("cloudflare:workers")
    .then(({ env }) => {
      if (env?.DB) return import("drizzle-orm/d1").then(({ drizzle }) => drizzle(env.DB as D1Database, { schema }));
      return getDevDb();
    })
    .catch(() => getDevDb());
}
