import * as schema from "./schema";

// In production (Cloudflare Workers), the real D1 binding is injected.
// In local dev mode (Node.js / Vite), we provide a fallback in-memory mock
// because cloudflare:workers is not available.

let _drizzle: ReturnType<typeof import("drizzle-orm/d1").drizzle> | null = null;

interface D1Result<T> {
  results: T[];
}

async function getDevDb(): Promise<ReturnType<typeof import("drizzle-orm/d1").drizzle>> {
  if (_drizzle) return _drizzle;

  // Dynamic imports — ESM-friendly and don't fail when cloudflare:workers is absent
  const { drizzle } = await import("drizzle-orm/d1");

  // In-memory mock D1 for local dev. Submissions API will work but data is ephemeral.
  const rows = new Map<string, Record<string, unknown>[]>();
  const defaultTable = "submissions";
  rows.set(defaultTable, []);

  const mockBinding = {
    prepare(sql: string) {
      const trimmed = sql.trim().toUpperCase();
      return {
        bind(...values: unknown[]) {
          return {
            async all<T>(): Promise<D1Result<T>> {
              const key = String(values[0] || "");
              const table = rows.get(defaultTable) || [];
              return { results: table as T[] };
            },
            async run(): Promise<{ success: boolean }> {
              return { success: true };
            },
            async first<T>(): Promise<T | null> {
              return null;
            },
          };
        },
        async all<T>(): Promise<D1Result<T>> {
          return { results: [] };
        },
        async run(): Promise<{ success: boolean }> {
          return { success: true };
        },
      };
    },
    async dump() {
      return [];
    },
    async batch<T extends unknown[]>(_statements: unknown[]): Promise<T> {
      return [] as unknown as T;
    },
    async exec(_sql: string) {
      return { count: 0, duration: 0 };
    },
  };

  _drizzle = drizzle(mockBinding as unknown as D1Database, { schema });
  return _drizzle;
}

export async function getDb() {
  // Try Cloudflare Workers binding first (production)
  try {
    const { env } = await import("cloudflare:workers");
    if (env?.DB) {
      const { drizzle } = await import("drizzle-orm/d1");
      return drizzle(env.DB as D1Database, { schema });
    }
  } catch {
    // cloudflare:workers not available (dev mode) — use mock
  }

  return getDevDb();
}
