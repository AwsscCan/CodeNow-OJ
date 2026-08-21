import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import type { PreparedQuery } from "drizzle-orm/session";
import { createD1Db, createLocalDb, type Database } from "../../../db/client";
import { accounts, adminAuditLogs, sessions, users } from "../../../db/schema";
import { adminAuditRow } from "./admin-audit";

type RepositoryDb = ReturnType<typeof createLocalDb>;
type D1Db = ReturnType<typeof createD1Db>;
type Failure = { ok: false; status: number; code: string; message: string };
type Success<T = undefined> = { ok: true; value: T };
type D1BatchStatement = unknown;
type NativeD1Client = {
  prepare(sql: string): { bind(...params: unknown[]): unknown };
  batch(statements: unknown[]): Promise<unknown>;
};
type D1BatchResponse = { success?: unknown; error?: unknown };
type PreparedD1BatchStatement = { _prepare(): PreparedQuery };

const passwordAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

function temporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => passwordAlphabet[byte & 63]).join("");
}

function failure(status: number, code: string, message: string): Failure {
  return { ok: false, status, code, message };
}

class D1BatchFailure extends Error {
  constructor(
    readonly statementIndex: number,
    readonly response: unknown,
  ) {
    super(batchFailureMessage(statementIndex, response));
    this.name = "D1BatchFailure";
  }
}

function batchFailureMessage(statementIndex: number, response: unknown) {
  if (response && typeof response === "object") {
    const error = (response as D1BatchResponse).error;
    if (typeof error === "string" && error) return error;
  }
  return `D1 batch statement ${statementIndex} did not succeed`;
}

function isD1BatchFailure(error: unknown): error is D1BatchFailure {
  return error instanceof D1BatchFailure;
}

function successfulD1BatchResponse(response: unknown): response is D1BatchResponse & { success: true } {
  return Boolean(response && typeof response === "object" && (response as D1BatchResponse).success === true);
}

function prepareD1BatchStatement(statement: D1BatchStatement): PreparedQuery {
  if (!statement || typeof statement !== "object" || typeof (statement as Partial<PreparedD1BatchStatement>)._prepare !== "function") {
    throw new Error("D1 batch statement cannot be prepared");
  }
  return (statement as PreparedD1BatchStatement)._prepare();
}

export async function executeD1Batch(
  database: { $client: unknown },
  statements: readonly D1BatchStatement[],
): Promise<unknown[]> {
  const prepared = statements.map(prepareD1BatchStatement);
  const client = database.$client as NativeD1Client;
  const bound = prepared.map((statement) => {
    const query = statement.getQuery();
    return client.prepare(query.sql).bind(...query.params);
  });
  const responses = await client.batch(bound);

  if (!Array.isArray(responses)) throw new D1BatchFailure(-1, responses);
  for (let index = 0; index < prepared.length; index += 1) {
    const response = responses[index];
    if (!successfulD1BatchResponse(response)) throw new D1BatchFailure(index, response);
  }
  if (responses.length !== prepared.length) throw new D1BatchFailure(prepared.length, undefined);

  return prepared.map((statement, index) => statement.mapResult(responses[index], true));
}

function isD1Database(db: Database): db is D1Db {
  return "batch" in db;
}

function isUserEmailUniqueConstraint(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.replace(/["`\[\]]/g, "").toLowerCase();
  const isUserEmailUnique = message.includes("unique constraint failed") && /\busers?\s*\.\s*email\b/.test(message);
  if (!isUserEmailUnique) return false;

  if (isD1BatchFailure(error)) return error.statementIndex === 0;
  return (error as Error & { code?: unknown }).code === "SQLITE_CONSTRAINT_UNIQUE";
}

export function createAdminAccountService(db: Database) {
  const database = db as RepositoryDb;

  async function activeAdmin(adminUserId: string) {
    const [admin] = await database.select({ id: users.id }).from(users).where(and(
      eq(users.id, adminUserId), eq(users.role, "admin"), eq(users.banned, false),
    )).limit(1);
    return Boolean(admin);
  }

  async function targetUser(targetUserId: string) {
    const [target] = await database.select().from(users).where(eq(users.id, targetUserId)).limit(1);
    return target;
  }

  return {
    async invite(adminUserId: string, requestId: string, input: { email: string; name: string }): Promise<Failure | Success<{
      user: { id: string; email: string; name: string };
      temporaryPassword: string;
    }>> {
      if (!await activeAdmin(adminUserId)) return failure(404, "NOT_FOUND", "Not found");
      const email = input.email.trim().toLowerCase();
      const name = input.name.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length < 1 || name.length > 100) {
        return failure(400, "INVALID_INVITATION", "A valid email and name are required");
      }
      const [existing] = await database.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing) return failure(409, "USER_EXISTS", "The invited account already exists");

      const password = temporaryPassword();
      const passwordHash = await hashPassword(password);
      const userId = crypto.randomUUID();
      const now = new Date();
      const userRow = {
        id: userId, name, email, emailVerified: true, role: "user" as const, banned: false,
        mustChangePassword: true, createdAt: now, updatedAt: now,
      };
      const accountRow = {
        id: crypto.randomUUID(), accountId: userId, providerId: "credential", userId,
        password: passwordHash, createdAt: now, updatedAt: now,
      };
      const auditRow = adminAuditRow({ adminUserId, action: "user.invite", targetType: "user", targetId: userId, requestId, now });

      try {
        if (isD1Database(db)) {
          await executeD1Batch(db, [
            db.insert(users).values(userRow),
            db.insert(accounts).values(accountRow),
            db.insert(adminAuditLogs).values(auditRow),
          ]);
        } else {
          database.transaction((tx) => {
            tx.insert(users).values(userRow).run();
            tx.insert(accounts).values(accountRow).run();
            tx.insert(adminAuditLogs).values(auditRow).run();
          });
        }
      } catch (error) {
        if (isUserEmailUniqueConstraint(error)) {
          const [current] = await database.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
          if (current) return failure(409, "USER_EXISTS", "The invited account already exists");
        }
        throw error;
      }
      return { ok: true, value: { user: { id: userId, email, name }, temporaryPassword: password } };
    },

    async ban(adminUserId: string, requestId: string, targetUserId: string, reason: string): Promise<Failure | Success> {
      if (!await activeAdmin(adminUserId)) return failure(404, "NOT_FOUND", "Not found");
      const target = await targetUser(targetUserId);
      if (!target) return failure(404, "NOT_FOUND", "Not found");
      const normalizedReason = reason.trim();
      if (!normalizedReason || normalizedReason.length > 200) return failure(400, "INVALID_REASON", "A short ban reason is required");
      if (target.role === "admin" && !target.banned) {
        const activeAdmins = await database.select({ id: users.id }).from(users)
          .where(and(eq(users.role, "admin"), eq(users.banned, false)));
        if (activeAdmins.length <= 1) return failure(409, "LAST_ADMIN", "The last active administrator cannot be banned");
      }
      const now = new Date();
      const auditRow = adminAuditRow({ adminUserId, action: "user.ban", targetType: "user", targetId: targetUserId, requestId, now });
      if (isD1Database(db)) {
        await executeD1Batch(db, [
          db.update(users).set({ banned: true, banReason: normalizedReason, banExpires: null, updatedAt: now }).where(eq(users.id, targetUserId)),
          db.delete(sessions).where(eq(sessions.userId, targetUserId)),
          db.insert(adminAuditLogs).values(auditRow),
        ]);
      } else {
        database.transaction((tx) => {
          tx.update(users).set({ banned: true, banReason: normalizedReason, banExpires: null, updatedAt: now }).where(eq(users.id, targetUserId)).run();
          tx.delete(sessions).where(eq(sessions.userId, targetUserId)).run();
          tx.insert(adminAuditLogs).values(auditRow).run();
        });
      }
      return { ok: true, value: undefined };
    },

    async unban(adminUserId: string, requestId: string, targetUserId: string): Promise<Failure | Success> {
      if (!await activeAdmin(adminUserId)) return failure(404, "NOT_FOUND", "Not found");
      if (!await targetUser(targetUserId)) return failure(404, "NOT_FOUND", "Not found");
      const now = new Date();
      const auditRow = adminAuditRow({ adminUserId, action: "user.unban", targetType: "user", targetId: targetUserId, requestId, now });
      if (isD1Database(db)) {
        await executeD1Batch(db, [
          db.update(users).set({ banned: false, banReason: null, banExpires: null, updatedAt: now }).where(eq(users.id, targetUserId)),
          db.insert(adminAuditLogs).values(auditRow),
        ]);
      } else {
        database.transaction((tx) => {
          tx.update(users).set({ banned: false, banReason: null, banExpires: null, updatedAt: now }).where(eq(users.id, targetUserId)).run();
          tx.insert(adminAuditLogs).values(auditRow).run();
        });
      }
      return { ok: true, value: undefined };
    },

    async resetPassword(adminUserId: string, requestId: string, targetUserId: string): Promise<Failure | Success<{ temporaryPassword: string }>> {
      if (!await activeAdmin(adminUserId)) return failure(404, "NOT_FOUND", "Not found");
      if (!await targetUser(targetUserId)) return failure(404, "NOT_FOUND", "Not found");
      const password = temporaryPassword();
      const passwordHash = await hashPassword(password);
      const now = new Date();
      const credentialFilter = and(eq(accounts.userId, targetUserId), eq(accounts.providerId, "credential"));
      const auditRow = adminAuditRow({ adminUserId, action: "user.password_reset", targetType: "user", targetId: targetUserId, requestId, now });
      if (isD1Database(db)) {
        await executeD1Batch(db, [
          db.update(accounts).set({ password: passwordHash, updatedAt: now }).where(credentialFilter),
          db.update(users).set({ mustChangePassword: true, updatedAt: now }).where(eq(users.id, targetUserId)),
          db.delete(sessions).where(eq(sessions.userId, targetUserId)),
          db.insert(adminAuditLogs).values(auditRow),
        ]);
      } else {
        database.transaction((tx) => {
          tx.update(accounts).set({ password: passwordHash, updatedAt: now }).where(credentialFilter).run();
          tx.update(users).set({ mustChangePassword: true, updatedAt: now }).where(eq(users.id, targetUserId)).run();
          tx.delete(sessions).where(eq(sessions.userId, targetUserId)).run();
          tx.insert(adminAuditLogs).values(auditRow).run();
        });
      }
      return { ok: true, value: { temporaryPassword: password } };
    },

    async revokeSessions(adminUserId: string, requestId: string, targetUserId: string): Promise<Failure | Success> {
      if (!await activeAdmin(adminUserId)) return failure(404, "NOT_FOUND", "Not found");
      if (!await targetUser(targetUserId)) return failure(404, "NOT_FOUND", "Not found");
      const now = new Date();
      const auditRow = adminAuditRow({ adminUserId, action: "user.sessions_revoke", targetType: "user", targetId: targetUserId, requestId, now });
      if (isD1Database(db)) {
        await executeD1Batch(db, [
          db.delete(sessions).where(eq(sessions.userId, targetUserId)),
          db.insert(adminAuditLogs).values(auditRow),
        ]);
      } else {
        database.transaction((tx) => {
          tx.delete(sessions).where(eq(sessions.userId, targetUserId)).run();
          tx.insert(adminAuditLogs).values(auditRow).run();
        });
      }
      return { ok: true, value: undefined };
    },
  };
}
