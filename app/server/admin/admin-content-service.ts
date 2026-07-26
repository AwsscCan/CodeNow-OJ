import { and, eq, gt, isNull } from "drizzle-orm";
import { createLocalDb, type Database } from "../../../db/client";
import { adminAuditLogs, aiConversations, codeDrafts, problems, users } from "../../../db/schema";
import { adminAuditRow } from "./admin-audit";

type RepositoryDb = ReturnType<typeof createLocalDb>;
type ContentType = "problem" | "draft" | "conversation";
type Failure = { ok: false; status: 400 | 404; code: string; message: string };

function failure(status: 400 | 404, code: string, message: string): Failure {
  return { ok: false, status, code, message };
}

function isD1Database(db: Database): db is Database & { batch: (...queries: never[]) => Promise<unknown> } {
  return "batch" in db;
}

export function createAdminContentService(db: Database) {
  const database = db as RepositoryDb;

  async function authorize(adminUserId: string) {
    const [admin] = await database.select({ id: users.id }).from(users).where(and(
      eq(users.id, adminUserId), eq(users.role, "admin"), eq(users.banned, false),
    )).limit(1);
    return Boolean(admin);
  }

  return {
    async list(adminUserId: string, type: ContentType, cursor: string | null, requestedLimit: number) {
      if (!await authorize(adminUserId)) return failure(404, "NOT_FOUND", "Not found");
      const limit = Math.min(50, Math.max(1, Math.trunc(requestedLimit) || 20));
      if (type === "problem") {
        const query = database.select({
          id: problems.id, userId: problems.userId, title: problems.title, problemCode: problems.problemCode,
          deletedAt: problems.deletedAt, updatedAt: problems.updatedAt,
        }).from(problems);
        const rows = await (cursor ? query.where(gt(problems.id, cursor)) : query).orderBy(problems.id).limit(limit + 1);
        const items = rows.slice(0, limit);
        return { ok: true as const, value: { items, nextCursor: rows.length > limit ? items.at(-1)?.id ?? null : null } };
      }
      if (type === "draft") {
        const query = database.select({
          id: codeDrafts.id, userId: codeDrafts.userId, problemKind: codeDrafts.problemKind,
          problemRef: codeDrafts.problemRef, language: codeDrafts.language,
          deletedAt: codeDrafts.deletedAt, updatedAt: codeDrafts.updatedAt,
        }).from(codeDrafts);
        const rows = await (cursor ? query.where(gt(codeDrafts.id, cursor)) : query).orderBy(codeDrafts.id).limit(limit + 1);
        const items = rows.slice(0, limit);
        return { ok: true as const, value: { items, nextCursor: rows.length > limit ? items.at(-1)?.id ?? null : null } };
      }
      if (type === "conversation") {
        const query = database.select({
          id: aiConversations.id, userId: aiConversations.userId, title: aiConversations.title,
          problemRef: aiConversations.problemRef, deletedAt: aiConversations.deletedAt, updatedAt: aiConversations.updatedAt,
        }).from(aiConversations);
        const rows = await (cursor ? query.where(gt(aiConversations.id, cursor)) : query).orderBy(aiConversations.id).limit(limit + 1);
        const items = rows.slice(0, limit);
        return { ok: true as const, value: { items, nextCursor: rows.length > limit ? items.at(-1)?.id ?? null : null } };
      }
      return failure(400, "INVALID_CONTENT_TYPE", "Invalid content type");
    },

    async detail(adminUserId: string, type: ContentType, id: string) {
      if (!await authorize(adminUserId)) return failure(404, "NOT_FOUND", "Not found");
      const table = type === "problem" ? problems : type === "draft" ? codeDrafts : type === "conversation" ? aiConversations : null;
      if (!table) return failure(400, "INVALID_CONTENT_TYPE", "Invalid content type");
      const [row] = await database.select().from(table).where(eq(table.id, id)).limit(1);
      return row ? { ok: true as const, value: row } : failure(404, "NOT_FOUND", "Not found");
    },

    async setDeleted(adminUserId: string, requestId: string, type: ContentType, id: string, deleted: boolean) {
      if (!await authorize(adminUserId)) return failure(404, "NOT_FOUND", "Not found");
      const table = type === "problem" ? problems : type === "draft" ? codeDrafts : type === "conversation" ? aiConversations : null;
      if (!table) return failure(400, "INVALID_CONTENT_TYPE", "Invalid content type");
      const [target] = await database.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
      if (!target) return failure(404, "NOT_FOUND", "Not found");
      const now = new Date();
      const audit = adminAuditRow({
        adminUserId,
        action: deleted ? "content.soft_delete" : "content.restore",
        targetType: type,
        targetId: id,
        requestId,
        now,
      });
      if (isD1Database(db)) {
        await db.batch([
          db.update(table).set({ deletedAt: deleted ? now : null, updatedAt: now }).where(eq(table.id, id)),
          db.insert(adminAuditLogs).values(audit),
        ] as never);
      } else {
        database.transaction((tx) => {
          tx.update(table).set({ deletedAt: deleted ? now : null, updatedAt: now }).where(eq(table.id, id)).run();
          tx.insert(adminAuditLogs).values(audit).run();
        });
      }
      return { ok: true as const, value: { id, deletedAt: deleted ? now.toISOString() : null } };
    },
  };
}

