import BetterSqlite3 from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { verifyPassword } from "better-auth/crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createAdminAccountService } from "../../app/server/admin/admin-account-service";
import { createAdminAuthorization } from "../../app/server/admin/admin-authorization";
import { accounts, adminAuditLogs, sessions, users } from "../../db/schema";
import * as schema from "../../db/schema";

describe("administrator account service", () => {
  let sqlite: BetterSqlite3.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: ReturnType<typeof createAdminAccountService>;

  beforeEach(() => {
    sqlite = new BetterSqlite3(":memory:");
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "drizzle" });
    const now = new Date();
    db.insert(users).values({
      id: "admin-a", name: "Owner", email: "owner@example.test", emailVerified: true,
      role: "admin", createdAt: now, updatedAt: now,
    }).run();
    service = createAdminAccountService(db);
  });

  it("creates a verified invited user and returns a password exactly once", async () => {
    const result = await service.invite("admin-a", "request-1", { email: "Friend@Example.test", name: "Friend" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect((await db.select().from(users).where(eq(users.id, result.value.user.id)))[0]).toMatchObject({
      email: "friend@example.test", emailVerified: true, role: "user", mustChangePassword: true,
    });
    const credential = (await db.select().from(accounts).where(eq(accounts.userId, result.value.user.id)))[0];
    expect(await verifyPassword({ hash: credential.password!, password: result.value.temporaryPassword })).toBe(true);
    expect(JSON.stringify(await db.select().from(adminAuditLogs))).not.toMatch(/friend@example|temporaryPassword|password/i);

    const duplicate = await service.invite("admin-a", "request-2", { email: "friend@example.test", name: "Other" });
    expect(duplicate).toMatchObject({ ok: false, status: 409, code: "USER_EXISTS" });
  });

  it("protects the last active administrator", async () => {
    expect(await service.ban("admin-a", "request-3", "admin-a", "cannot ban owner"))
      .toMatchObject({ ok: false, status: 409, code: "LAST_ADMIN" });
  });

  it("bans, unbans, resets passwords, and revokes sessions with redacted audits", async () => {
    const now = new Date();
    db.insert(users).values({
      id: "admin-b", name: "Backup", email: "backup@example.test", emailVerified: true,
      role: "admin", createdAt: now, updatedAt: now,
    }).run();
    db.insert(sessions).values({
      id: "session-a", token: "secret-session-token", userId: "admin-a",
      createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + 60_000),
    }).run();

    expect(await service.ban("admin-b", "request-4", "admin-a", "policy violation")).toMatchObject({ ok: true });
    expect((await db.select().from(users).where(eq(users.id, "admin-a")))[0]).toMatchObject({ banned: true, banReason: "policy violation" });
    expect(await db.select().from(sessions).where(eq(sessions.userId, "admin-a"))).toHaveLength(0);

    expect(await service.unban("admin-b", "request-5", "admin-a")).toMatchObject({ ok: true });
    const reset = await service.resetPassword("admin-b", "request-6", "admin-a");
    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    expect(reset.value.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect((await db.select().from(users).where(eq(users.id, "admin-a")))[0]).toMatchObject({ banned: false, mustChangePassword: true });

    const auditJson = JSON.stringify(await db.select().from(adminAuditLogs));
    expect(auditJson).not.toContain("secret-session-token");
    expect(auditJson).not.toContain(reset.value.temporaryPassword);
    sqlite.close();
  });

  it("authorizes only a current active administrator from the database", async () => {
    let sessionUserId: string | null = "admin-a";
    const authorization = createAdminAuthorization(async () => ({
      auth: { api: { getSession: async () => sessionUserId ? { user: { id: sessionUserId } } : null } },
      db,
      rateLimitPepper: "pepper",
    }));
    const request = new Request("http://localhost/api/admin/users");

    await expect(authorization.requireAdmin(request)).resolves.toMatchObject({ userId: "admin-a" });
    db.update(users).set({ banned: true }).where(eq(users.id, "admin-a")).run();
    await expect(authorization.requireAdmin(request)).resolves.toBeNull();
    sessionUserId = null;
    await expect(authorization.requireAdmin(request)).resolves.toBeNull();
    sqlite.close();
  });
});
