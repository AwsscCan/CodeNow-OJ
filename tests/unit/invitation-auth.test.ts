import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it, vi } from "vitest";
import { createAuthRouteHandlers } from "../../app/api/auth/[...all]/route";
import { createAuth } from "../../app/lib/auth";
import * as schema from "../../db/schema";

function request(path: string) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

describe("invitation-only auth routes", () => {
  it("installs the Better Auth administrator endpoints", () => {
    const sqlite = new BetterSqlite3(":memory:");
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "drizzle" });
    const auth = createAuth({
      db,
      env: {
        environment: "test",
        baseURL: "http://localhost",
        secret: "invitation-test-secret-at-least-32-characters",
      },
    });

    expect(typeof (auth.api as Record<string, unknown>).createUser).toBe("function");
    expect(typeof (auth.api as Record<string, unknown>).banUser).toBe("function");
    expect(typeof (auth.api as Record<string, unknown>).revokeUserSessions).toBe("function");
    sqlite.close();
  });

  it.each([
    "/api/auth/sign-up/email",
    "/api/auth/send-verification-email",
    "/api/auth/request-password-reset",
    "/api/auth/reset-password",
  ])("hides %s while invitation mode is enabled", async (path) => {
    const handler = vi.fn(async () => new Response(null, { status: 204 }));
    const routes = createAuthRouteHandlers(
      async () => ({ auth: { handler }, db: {}, rateLimitPepper: "pepper" }),
      async () => null,
      () => true,
    );

    const response = await routes.POST(request(path));

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    "/api/auth/sign-in/email",
    "/api/auth/change-password",
    "/api/auth/get-session",
  ])("keeps %s available", async (path) => {
    const handler = vi.fn(async () => Response.json({ forwarded: true }));
    const routes = createAuthRouteHandlers(
      async () => ({ auth: { handler }, db: {}, rateLimitPepper: "pepper" }),
      async () => null,
      () => true,
    );

    const response = await routes.POST(request(path));

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
