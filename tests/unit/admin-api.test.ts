import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createAdminAuditHandlers } from "../../app/api/admin/audit/route";
import { createAdminOverviewHandlers } from "../../app/api/admin/overview/route";
import { createAdminUserHandlers } from "../../app/api/admin/users/[id]/route";
import { createAdminUserSessionHandlers } from "../../app/api/admin/users/[id]/sessions/route";
import { createAdminUsersHandlers } from "../../app/api/admin/users/route";
import { createAdminAccountService } from "../../app/server/admin/admin-account-service";
import { sessions, users } from "../../db/schema";
import * as schema from "../../db/schema";

function request(path: string, method = "GET", body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-request-id": "admin-api-request" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("administrator APIs", () => {
  let sqlite: BetterSqlite3.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let identity: "admin" | "user" | "anonymous";
  let resolve: (request: Request) => Promise<{ userId: string; services: { db: typeof db } } | null>;

  beforeEach(() => {
    sqlite = new BetterSqlite3(":memory:");
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "drizzle" });
    const now = new Date();
    db.insert(users).values([
      { id: "admin-a", name: "Owner", email: "owner@example.test", emailVerified: true, role: "admin", createdAt: now, updatedAt: now },
      { id: "user-a", name: "User", email: "user@example.test", emailVerified: true, role: "user", createdAt: now, updatedAt: now },
    ]).run();
    identity = "admin";
    resolve = async () => identity !== "admin" ? null : {
      userId: "admin-a",
      services: { db },
    };
  });

  it.each(["anonymous", "user"] as const)("returns 404 to %s callers", async (caller) => {
    identity = caller;
    const response = await createAdminUsersHandlers(resolve).GET(request("/api/admin/users"));
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("invites and paginates users without credential fields", async () => {
    const handlers = createAdminUsersHandlers(resolve);
    const created = await handlers.POST(request("/api/admin/users", "POST", { email: "friend@example.test", name: "Friend" }));
    expect(created.status).toBe(201);
    const invitation = await created.json() as { temporaryPassword: string };
    expect(invitation.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const listed = await handlers.GET(request("/api/admin/users?limit=2"));
    expect(listed.status).toBe(200);
    const body = await listed.json() as { items: Array<Record<string, unknown>> };
    expect(body.items.every((item) => !("password" in item) && !("token" in item) && !("banReason" in item))).toBe(true);
    expect(listed.headers.get("cache-control")).toBe("private, no-store");
  });

  it("applies bounded user actions, session revocation, overview, and audit pagination", async () => {
    const service = createAdminAccountService(db);
    const invitation = await service.invite("admin-a", "seed-request", { email: "friend@example.test", name: "Friend" });
    if (!invitation.ok) throw new Error(invitation.message);
    const friendId = invitation.value.user.id;
    const now = new Date();
    db.insert(sessions).values({
      id: "friend-session", token: "private-token", userId: friendId,
      createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + 60_000),
    }).run();

    const userHandlers = createAdminUserHandlers(resolve);
    expect((await userHandlers.PATCH(request(`/api/admin/users/${friendId}`, "PATCH", { action: "ban", reason: "policy" }), friendId)).status).toBe(200);
    expect((await userHandlers.PATCH(request(`/api/admin/users/${friendId}`, "PATCH", { action: "unban" }), friendId)).status).toBe(200);
    const reset = await userHandlers.PATCH(request(`/api/admin/users/${friendId}`, "PATCH", { action: "reset-password" }), friendId);
    expect((await reset.json() as { temporaryPassword: string }).temporaryPassword).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const sessionsHandler = createAdminUserSessionHandlers(resolve);
    expect((await sessionsHandler.DELETE(request(`/api/admin/users/${friendId}/sessions`, "DELETE"), friendId)).status).toBe(200);

    expect((await createAdminOverviewHandlers(resolve).GET(request("/api/admin/overview"))).status).toBe(200);
    const audit = await createAdminAuditHandlers(resolve).GET(request("/api/admin/audit?limit=20"));
    expect(audit.status).toBe(200);
    expect(JSON.stringify(await audit.json())).not.toMatch(/private-token|temporaryPassword|friend@example/i);
  });
});
