import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import { checkAuthRateLimit, guardAuthRequest, validateAuthOrigin } from "../../app/server/security/auth-rate-limit";
import * as schema from "../../db/schema";

describe("authentication security boundaries", () => {
  it("rejects cross-origin and malformed mutating requests", () => {
    expect(validateAuthOrigin(new Request("https://oj.example/api/auth/sign-in/email", { method: "POST", headers: { Origin: "https://evil.example" } }))).toBe(false);
    expect(validateAuthOrigin(new Request("https://oj.example/api/auth/sign-in/email", { method: "POST", headers: { Origin: "not a url" } }))).toBe(false);
    expect(validateAuthOrigin(new Request("https://oj.example/api/auth/sign-in/email", { method: "POST", headers: { Origin: "https://oj.example" } }))).toBe(true);
    expect(validateAuthOrigin(new Request("https://oj.example/api/auth/get-session"))).toBe(true);
  });

  it("persists and enforces a hashed rate-limit window", async () => {
    const sqlite = new BetterSqlite3(":memory:");
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "drizzle" });
    const input = { action: "sign-in", identifier: "user@example.com", pepper: "test-pepper", limit: 2, windowMs: 60_000 };

    expect((await checkAuthRateLimit(db, input)).allowed).toBe(true);
    expect((await checkAuthRateLimit(db, input)).allowed).toBe(true);
    expect((await checkAuthRateLimit(db, input)).allowed).toBe(false);
    const stored = sqlite.prepare("select key_hash from auth_rate_limits").get() as { key_hash: string };
    expect(stored.key_hash).not.toContain("user@example.com");
    sqlite.close();
  });

  it("blocks repeated registration requests", async () => {
    const sqlite = new BetterSqlite3(":memory:");
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "drizzle" });
    const makeRequest = () => new Request("https://oj.example/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://oj.example", "CF-Connecting-IP": "192.0.2.5" },
      body: JSON.stringify({ email: "user@example.com" }),
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await guardAuthRequest(db, makeRequest(), "pepper")).toBeNull();
    }
    expect((await guardAuthRequest(db, makeRequest(), "pepper"))?.status).toBe(429);
    sqlite.close();
  });
});
