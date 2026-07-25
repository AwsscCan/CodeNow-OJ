import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import { createAuth } from "../../app/lib/auth";
import * as schema from "../../db/schema";

describe("auth factory", () => {
  it("serves an anonymous session from a migrated SQLite database", async () => {
    const sqlite = new BetterSqlite3(":memory:");
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "drizzle" });
    const auth = createAuth({
      db,
      env: {
        environment: "test",
        baseURL: "http://localhost:3000",
        secret: "test-secret-at-least-32-characters",
      },
    });

    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/get-session"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
    sqlite.close();
  });

  it("creates an unverified email account", async () => {
    const sqlite = new BetterSqlite3(":memory:");
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "drizzle" });
    const auth = createAuth({
      db,
      env: {
        environment: "test",
        baseURL: "http://localhost:3000",
        secret: "test-secret-at-least-32-characters",
      },
    });

    const response = await auth.handler(new Request(
      "http://localhost:3000/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test User",
          email: "test-user@example.com",
          password: "correct-horse-battery-staple",
        }),
      },
    ));

    expect(response.status).toBe(200);
    expect(sqlite.prepare("select email_verified from user where email = ?")
      .get("test-user@example.com"))
      .toEqual({ email_verified: 0 });
    sqlite.close();
  });
});
