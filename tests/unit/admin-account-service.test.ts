import { verifyPassword } from "better-auth/crypto";
import BetterSqlite3 from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createAdminAccountService } from "../../app/server/admin/admin-account-service";
import { createAdminAuthorization } from "../../app/server/admin/admin-authorization";
import { createD1Db, type D1Binding } from "../../db/client";
import { accounts, adminAuditLogs, sessions, users } from "../../db/schema";
import * as schema from "../../db/schema";

type D1StatementExecution = { sql: string; params: unknown[]; inBatch: boolean };
type D1SqliteBindingOptions = {
  beforeBatch?: () => void | Promise<void>;
  beforeExecute?: (execution: D1StatementExecution) => void | Promise<void>;
};
type D1SuccessResult = {
  success: true;
  results: Record<string, unknown>[];
  meta: { changes: number; last_row_id: number; duration: number; rows_read: number; rows_written: number };
};
type D1FailureResult = {
  success: false;
  error: string;
  results: Record<string, unknown>[];
  meta: { changes: number; last_row_id: number; duration: number; rows_read: number; rows_written: number };
};
type D1Result = D1SuccessResult | D1FailureResult;

const executeInBatch = Symbol("executeInBatch");

type BoundStatement = {
  all(): Promise<D1SuccessResult>;
  raw(): Promise<unknown[][]>;
  run(): Promise<D1SuccessResult>;
  [executeInBatch](): Promise<D1SuccessResult>;
};

function createSqliteD1Binding(sqlite: BetterSqlite3.Database, options: D1SqliteBindingOptions = {}): D1Binding {
  async function execute(sql: string, params: unknown[], inBatch = false): Promise<D1SuccessResult> {
    const execution = { sql, params: [...params], inBatch };
    await options.beforeExecute?.(execution);
    const statement = sqlite.prepare(sql);
    if (statement.reader) {
      return {
        success: true,
        results: statement.all(...params) as Record<string, unknown>[],
        meta: { changes: 0, last_row_id: 0, duration: 0, rows_read: 0, rows_written: 0 },
      };
    }

    const result = statement.run(...params);
    return {
      success: true,
      results: [],
      meta: {
        changes: result.changes,
        last_row_id: Number(result.lastInsertRowid),
        duration: 0,
        rows_read: 0,
        rows_written: result.changes,
      },
    };
  }

  async function raw(sql: string, params: unknown[], inBatch = false): Promise<unknown[][]> {
    const execution = { sql, params: [...params], inBatch };
    await options.beforeExecute?.(execution);
    const statement = sqlite.prepare(sql);
    return statement.reader ? statement.raw(true).all(...params) as unknown[][] : [];
  }

  return {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]): BoundStatement {
          return {
            all: () => execute(sql, params),
            raw: () => raw(sql, params),
            run: () => execute(sql, params),
            [executeInBatch]: () => execute(sql, params, true),
          };
        },
      };
    },
    async batch(statements: BoundStatement[]) {
      const results: D1Result[] = [];
      await options.beforeBatch?.();
      sqlite.exec("BEGIN");
      try {
        for (const statement of statements) results.push(await statement[executeInBatch]());
        sqlite.exec("COMMIT");
      } catch (error) {
        if (sqlite.inTransaction) sqlite.exec("ROLLBACK");
        return [...results, {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          results: [],
          meta: { changes: 0, last_row_id: 0, duration: 0, rows_read: 0, rows_written: 0 },
        }];
      }
      return results;
    },
  } as unknown as D1Binding;
}

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

  it("maps a D1 user email race to USER_EXISTS only after confirming the user exists", async () => {
    const now = new Date();
    let raced = false;
    const binding = createSqliteD1Binding(sqlite, {
      beforeBatch: () => {
        if (raced) return;
        raced = true;
        db.insert(users).values({
          id: "racing-user", name: "Racer", email: "race@example.test", emailVerified: true,
          createdAt: now, updatedAt: now,
        }).run();
      },
    });
    const d1Service = createAdminAccountService(createD1Db(binding));

    await expect(d1Service.invite("admin-a", "request-race", { email: "race@example.test", name: "Invitee" }))
      .resolves.toMatchObject({ ok: false, status: 409, code: "USER_EXISTS" });
    expect(raced).toBe(true);
    expect(await db.select({ id: users.id }).from(users).where(eq(users.email, "race@example.test")))
      .toHaveLength(1);
    expect(await db.select().from(accounts)).toHaveLength(0);
    expect(await db.select().from(adminAuditLogs)).toHaveLength(0);
  });

  it("does not misclassify a D1 first-statement storage failure as USER_EXISTS", async () => {
    sqlite.exec(`
      create trigger reject_d1_invite_storage
      before insert on "user"
      when new.email = 'd1-storage-failure@example.test'
      begin
        select raise(abort, 'unique constraint failed: users.email');
      end;
    `);
    const d1Service = createAdminAccountService(createD1Db(createSqliteD1Binding(sqlite)));

    await expect(d1Service.invite("admin-a", "request-d1-storage", {
      email: "d1-storage-failure@example.test",
      name: "Invitee",
    })).rejects.toThrow("unique constraint failed: users.email");

    expect(await db.select({ id: users.id }).from(users).where(eq(users.email, "d1-storage-failure@example.test")))
      .toHaveLength(0);
    expect(await db.select().from(accounts)).toHaveLength(0);
    expect(await db.select().from(adminAuditLogs)).toHaveLength(0);
  });

  it("rolls back a D1 invitation when its audit write fails", async () => {
    const binding = createSqliteD1Binding(sqlite, {
      beforeExecute: ({ sql, inBatch }) => {
        if (inBatch && /^insert\s+into\s+"admin_audit_logs"/i.test(sql)) throw new Error("D1 invitation audit failed");
      },
    });
    const d1Service = createAdminAccountService(createD1Db(binding));

    await expect(d1Service.invite("admin-a", "request-audit", { email: "audit@example.test", name: "Invitee" }))
      .rejects.toThrow("D1 invitation audit failed");

    expect(await db.select({ id: users.id }).from(users).where(eq(users.email, "audit@example.test")))
      .toHaveLength(0);
    expect(await db.select().from(accounts)).toHaveLength(0);
    expect(await db.select().from(adminAuditLogs)).toHaveLength(0);
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
