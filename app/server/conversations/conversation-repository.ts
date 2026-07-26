import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "../../../db/client";
import { createD1Db, createLocalDb } from "../../../db/client";
import { aiConversations, aiMessages } from "../../../db/schema";

type RepositoryDb = ReturnType<typeof createLocalDb>;
type D1Db = ReturnType<typeof createD1Db>;
type ConversationRow = typeof aiConversations.$inferSelect;
type MessageRow = typeof aiMessages.$inferSelect;
type ErrorResult = { ok: false; status: 400 | 404 | 409 | 413; code: string; message: string; currentVersion?: number; updatedAt?: string };
type Result<T> = { ok: true; value: T } | ErrorResult;

const MAX_TITLE_LENGTH = 200;
const MAX_PROBLEM_REF_LENGTH = 128;
const MAX_MESSAGE_BYTES = 64 * 1024;
const encoder = new TextEncoder();
const sensitiveKey = /(apikey|token|secret|password|credential)/i;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function containsSensitiveField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveField);
  const object = record(value);
  return Boolean(object && Object.entries(object).some(([key, item]) => sensitiveKey.test(key.replace(/[^a-z]/gi, "")) || containsSensitiveField(item)));
}

function publicConversation(row: ConversationRow) {
  return {
    id: row.id, problemRef: row.problemRef, title: row.title, version: row.version,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

function publicMessage(row: MessageRow) {
  return {
    id: row.id, conversationId: row.conversationId, role: row.role, content: row.content,
    sortOrder: row.sortOrder, version: row.version,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

function isD1Database(db: Database): db is D1Db {
  return "batch" in db;
}

function conflict(row: ConversationRow): ErrorResult {
  return {
    ok: false, status: 409, code: "VERSION_CONFLICT", message: "Conversation changed on another device",
    currentVersion: row.version, updatedAt: row.updatedAt.toISOString(),
  };
}

export function createConversationRepository(db: Database) {
  const database = db as RepositoryDb;

  async function owned(userId: string, id: string) {
    const [row] = await database.select().from(aiConversations)
      .where(and(eq(aiConversations.userId, userId), eq(aiConversations.id, id), isNull(aiConversations.deletedAt))).limit(1);
    return row ?? null;
  }

  async function idempotentMessage(userId: string, conversationId: string, idempotencyKey: string) {
    const [row] = await database.select().from(aiMessages).where(and(
      eq(aiMessages.userId, userId), eq(aiMessages.conversationId, conversationId), eq(aiMessages.idempotencyKey, idempotencyKey),
    )).limit(1);
    return row ?? null;
  }

  return {
    async list(userId: string, cursor?: string | null, requestedLimit = 50) {
      const limit = Math.min(50, Math.max(1, Math.trunc(requestedLimit) || 50));
      const separator = cursor?.lastIndexOf("|") ?? -1;
      const cursorDate = separator > 0 ? new Date(cursor!.slice(0, separator)) : null;
      const cursorId = separator > 0 ? cursor!.slice(separator + 1) : "";
      const validCursor = cursorDate && !Number.isNaN(cursorDate.getTime());
      const filter = validCursor
        ? and(eq(aiConversations.userId, userId), or(
          lt(aiConversations.updatedAt, cursorDate),
          and(eq(aiConversations.updatedAt, cursorDate), lt(aiConversations.id, cursorId)),
        ))
        : and(eq(aiConversations.userId, userId), isNull(aiConversations.deletedAt));
      const activeFilter = validCursor ? and(filter, isNull(aiConversations.deletedAt)) : filter;
      const rows = await database.select().from(aiConversations).where(activeFilter)
        .orderBy(desc(aiConversations.updatedAt), desc(aiConversations.id)).limit(limit + 1);
      const items = rows.slice(0, limit).map(publicConversation);
      const last = rows.length > limit ? rows[limit - 1] : null;
      return { items, nextCursor: last ? `${last.updatedAt.toISOString()}|${last.id}` : null };
    },

    async create(userId: string, input: unknown): Promise<Result<ReturnType<typeof publicConversation>>> {
      const body = record(input);
      if (!body || containsSensitiveField(body) || Object.keys(body).some((key) => key !== "title" && key !== "problemRef")) {
        return { ok: false, status: 400, code: "INVALID_CONVERSATION", message: "Conversation fields are invalid" };
      }
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const problemRef = body.problemRef === undefined || body.problemRef === null ? null : typeof body.problemRef === "string" ? body.problemRef.trim() : "";
      if (!title) return { ok: false, status: 400, code: "INVALID_TITLE", message: "Conversation title is required" };
      if (title.length > MAX_TITLE_LENGTH || (problemRef !== null && problemRef.length > MAX_PROBLEM_REF_LENGTH)) {
        return { ok: false, status: 413, code: "CONVERSATION_TOO_LARGE", message: "Conversation metadata is too large" };
      }
      const now = new Date();
      const [row] = await database.insert(aiConversations).values({
        id: crypto.randomUUID(), userId, problemRef: problemRef || null, title, version: 1, createdAt: now, updatedAt: now,
      }).returning();
      return { ok: true, value: publicConversation(row) };
    },

    async updateTitle(userId: string, id: string, version: unknown, titleInput: unknown): Promise<Result<ReturnType<typeof publicConversation>>> {
      const row = await owned(userId, id);
      if (!row) return { ok: false, status: 404, code: "CONVERSATION_NOT_FOUND", message: "Conversation not found" };
      if (!Number.isInteger(version) || row.version !== version) return conflict(row);
      const title = typeof titleInput === "string" ? titleInput.trim() : "";
      if (!title) return { ok: false, status: 400, code: "INVALID_TITLE", message: "Conversation title is required" };
      if (title.length > MAX_TITLE_LENGTH) return { ok: false, status: 413, code: "TITLE_TOO_LARGE", message: "Conversation title is too large" };
      const [updated] = await database.update(aiConversations).set({ title, version: row.version + 1, updatedAt: new Date() })
        .where(and(eq(aiConversations.userId, userId), eq(aiConversations.id, id), eq(aiConversations.version, row.version))).returning();
      return updated ? { ok: true, value: publicConversation(updated) } : conflict((await owned(userId, id)) ?? row);
    },

    async delete(userId: string, id: string): Promise<Result<{ id: string }>> {
      const [deleted] = await database.delete(aiConversations)
        .where(and(eq(aiConversations.userId, userId), eq(aiConversations.id, id))).returning({ id: aiConversations.id });
      return deleted ? { ok: true, value: deleted } : { ok: false, status: 404, code: "CONVERSATION_NOT_FOUND", message: "Conversation not found" };
    },

    async listMessages(userId: string, conversationId: string, cursor?: number | null, requestedLimit = 100) {
      if (!(await owned(userId, conversationId))) {
        return { ok: false as const, status: 404 as const, code: "CONVERSATION_NOT_FOUND", message: "Conversation not found" };
      }
      const limit = Math.min(100, Math.max(1, Math.trunc(requestedLimit) || 100));
      const filter = Number.isInteger(cursor)
        ? and(eq(aiMessages.userId, userId), eq(aiMessages.conversationId, conversationId), gt(aiMessages.sortOrder, cursor!))
        : and(eq(aiMessages.userId, userId), eq(aiMessages.conversationId, conversationId));
      const rows = await database.select().from(aiMessages).where(filter).orderBy(aiMessages.sortOrder).limit(limit + 1);
      const items = rows.slice(0, limit).map(publicMessage);
      return { ok: true as const, value: { items, nextCursor: rows.length > limit ? items.at(-1)?.sortOrder ?? null : null } };
    },

    async appendMessage(userId: string, conversationId: string, input: unknown, idempotencyKey: string): Promise<Result<{ message: ReturnType<typeof publicMessage>; version: number; updatedAt: string }>> {
      const prior = await idempotentMessage(userId, conversationId, idempotencyKey);
      if (prior) return { ok: true, value: { message: publicMessage(prior), version: prior.version, updatedAt: prior.updatedAt.toISOString() } };
      const body = record(input);
      if (!body || containsSensitiveField(body) || Object.keys(body).some((key) => key !== "expectedVersion" && key !== "role" && key !== "content")) {
        return { ok: false, status: 400, code: "INVALID_MESSAGE", message: "Message fields are invalid" };
      }
      if (!Number.isInteger(body.expectedVersion) || (body.role !== "user" && body.role !== "assistant") || typeof body.content !== "string" || !body.content.trim()) {
        return { ok: false, status: 400, code: "INVALID_MESSAGE", message: "A version, role, and content are required" };
      }
      if (encoder.encode(body.content).byteLength > MAX_MESSAGE_BYTES) {
        return { ok: false, status: 413, code: "MESSAGE_TOO_LARGE", message: "Message content is limited to 64 KiB" };
      }
      const role = body.role as "user" | "assistant";
      const conversation = await owned(userId, conversationId);
      if (!conversation) return { ok: false, status: 404, code: "CONVERSATION_NOT_FOUND", message: "Conversation not found" };
      if (conversation.version !== body.expectedVersion) return conflict(conversation);
      const [last] = await database.select({ sortOrder: aiMessages.sortOrder }).from(aiMessages)
        .where(and(eq(aiMessages.userId, userId), eq(aiMessages.conversationId, conversationId)))
        .orderBy(desc(aiMessages.sortOrder)).limit(1);
      const sortOrder = (last?.sortOrder ?? -1) + 1;
      const now = new Date();
      const messageValues = {
        id: crypto.randomUUID(), userId, conversationId, role, content: body.content,
        idempotencyKey, sortOrder, version: conversation.version + 1, createdAt: now, updatedAt: now,
      };
      try {
        let saved: MessageRow;
        if (isD1Database(db)) {
          const guard = db.update(aiConversations).set({
            title: sql<string>`case when ${aiConversations.version} = ${conversation.version} then ${aiConversations.title} else null end`,
            version: conversation.version + 1,
            updatedAt: now,
          }).where(and(eq(aiConversations.userId, userId), eq(aiConversations.id, conversationId)));
          const result = await db.batch([guard, db.insert(aiMessages).values(messageValues).returning()]);
          saved = result[1][0];
        } else {
          saved = database.transaction((tx) => {
            const updated = tx.update(aiConversations).set({ version: conversation.version + 1, updatedAt: now })
              .where(and(eq(aiConversations.userId, userId), eq(aiConversations.id, conversationId), eq(aiConversations.version, conversation.version))).run();
            if (updated.changes !== 1) throw new Error("CONVERSATION_VERSION_CONFLICT");
            return tx.insert(aiMessages).values(messageValues).returning().get();
          });
        }
        return { ok: true, value: { message: publicMessage(saved), version: saved.version, updatedAt: saved.updatedAt.toISOString() } };
      } catch (error) {
        const winner = await idempotentMessage(userId, conversationId, idempotencyKey);
        if (winner) return { ok: true, value: { message: publicMessage(winner), version: winner.version, updatedAt: winner.updatedAt.toISOString() } };
        const latest = await owned(userId, conversationId);
        if (latest && latest.version !== conversation.version) return conflict(latest);
        if (error instanceof Error && error.message === "CONVERSATION_VERSION_CONFLICT") return conflict(latest ?? conversation);
        throw error;
      }
    },
  };
}

export type ConversationRepository = ReturnType<typeof createConversationRepository>;
