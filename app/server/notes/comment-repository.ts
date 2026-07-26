import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "../../../db/client";
import { createD1Db, createLocalDb } from "../../../db/client";
import { noteComments, notes, users } from "../../../db/schema";
import { MAX_COMMENT_CONTENT_BYTES } from "../../api/_lib/constants";

type RepositoryDb = ReturnType<typeof createLocalDb>;
type D1Db = ReturnType<typeof createD1Db>;
type CommentRow = typeof noteComments.$inferSelect;
type ErrorResult = { ok: false; status: 400 | 404 | 413; code: string; message: string; field?: string };
type Result<T> = { ok: true; value: T } | ErrorResult;

const encoder = new TextEncoder();

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function isD1Database(db: Database): db is D1Db {
  return "batch" in db;
}
function publicComment(row: CommentRow, author: { name: string; image: string | null }) {
  return {
    id: row.id, noteId: row.noteId, parentId: row.parentId, content: row.content, version: row.version,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    author: { name: author.name, image: author.image },
  };
}

export function createCommentRepository(db: Database) {
  const database = db as RepositoryDb;

  async function publicNoteById(noteId: string) {
    const [row] = await database.select().from(notes)
      .where(and(eq(notes.id, noteId), eq(notes.visibility, "public"), eq(notes.status, "published"), eq(notes.moderationState, "visible"), isNull(notes.deletedAt))).limit(1);
    return row ?? null;
  }
  async function authorOf(userId: string) {
    const [row] = await database.select({ name: users.name, image: users.image }).from(users).where(eq(users.id, userId)).limit(1);
    return row ?? { name: "用户", image: null };
  }

  return {
    async create(userId: string, noteId: string, input: unknown, idempotencyKey: string): Promise<Result<ReturnType<typeof publicComment>>> {
      const [prior] = await database.select().from(noteComments)
        .where(and(eq(noteComments.userId, userId), eq(noteComments.noteId, noteId), eq(noteComments.idempotencyKey, idempotencyKey))).limit(1);
      if (prior) return { ok: true, value: publicComment(prior, await authorOf(userId)) };

      const body = record(input);
      const content = typeof body?.content === "string" ? body.content.trim() : "";
      if (!content) return { ok: false, status: 400, code: "INVALID_COMMENT", message: "评论内容不能为空", field: "content" };
      if (encoder.encode(content).byteLength > MAX_COMMENT_CONTENT_BYTES) return { ok: false, status: 413, code: "COMMENT_TOO_LARGE", message: "评论内容过长", field: "content" };
      const parentId = typeof body?.parentId === "string" && body.parentId ? body.parentId : null;

      const note = await publicNoteById(noteId);
      if (!note) return { ok: false, status: 404, code: "NOTE_NOT_FOUND", message: "笔记不存在或未公开" };
      if (parentId) {
        const [parent] = await database.select({ id: noteComments.id }).from(noteComments)
          .where(and(eq(noteComments.id, parentId), eq(noteComments.noteId, noteId), isNull(noteComments.deletedAt))).limit(1);
        if (!parent) return { ok: false, status: 400, code: "INVALID_PARENT", message: "回复的评论不存在", field: "parentId" };
      }

      const now = new Date();
      const values = { id: crypto.randomUUID(), noteId, userId, parentId, content, idempotencyKey, version: 1, createdAt: now, updatedAt: now };
      let saved: CommentRow;
      if (isD1Database(db)) {
        const result = await db.batch([
          db.update(notes).set({ commentCount: sql`${notes.commentCount} + 1` }).where(eq(notes.id, noteId)),
          db.insert(noteComments).values(values).returning(),
        ]);
        saved = result[1][0];
      } else {
        saved = database.transaction((tx) => {
          tx.update(notes).set({ commentCount: sql`${notes.commentCount} + 1` }).where(eq(notes.id, noteId)).run();
          return tx.insert(noteComments).values(values).returning().get();
        });
      }
      return { ok: true, value: publicComment(saved, await authorOf(userId)) };
    },

    async listByNote(noteId: string, cursor?: string | null, requestedLimit = 50): Promise<Result<{ items: ReturnType<typeof publicComment>[]; nextCursor: string | null }>> {
      if (!(await publicNoteById(noteId))) return { ok: false, status: 404, code: "NOTE_NOT_FOUND", message: "笔记不存在或未公开" };
      const limit = Math.min(100, Math.max(1, Math.trunc(requestedLimit) || 50));
      const separator = cursor?.lastIndexOf("|") ?? -1;
      const cursorDate = separator > 0 ? new Date(cursor!.slice(0, separator)) : null;
      const cursorId = separator > 0 ? cursor!.slice(separator + 1) : "";
      const validCursor = cursorDate && !Number.isNaN(cursorDate.getTime());
      const conditions = [eq(noteComments.noteId, noteId), isNull(noteComments.deletedAt)];
      if (validCursor) conditions.push(or(lt(noteComments.createdAt, cursorDate!), and(eq(noteComments.createdAt, cursorDate!), lt(noteComments.id, cursorId)))!);
      const rows = await database.select({ comment: noteComments, name: users.name, image: users.image }).from(noteComments)
        .innerJoin(users, eq(noteComments.userId, users.id)).where(and(...conditions))
        .orderBy(desc(noteComments.createdAt), desc(noteComments.id)).limit(limit + 1);
      const items = rows.slice(0, limit).map((row) => publicComment(row.comment, { name: row.name, image: row.image }));
      const last = rows.length > limit ? rows[limit - 1] : null;
      return { ok: true, value: { items, nextCursor: last ? `${last.comment.createdAt.toISOString()}|${last.comment.id}` : null } };
    },

    async remove(actorId: string, commentId: string): Promise<Result<{ id: string }>> {
      const [comment] = await database.select().from(noteComments).where(and(eq(noteComments.id, commentId), isNull(noteComments.deletedAt))).limit(1);
      if (!comment) return { ok: false, status: 404, code: "COMMENT_NOT_FOUND", message: "评论不存在" };
      const [owner] = await database.select({ userId: notes.userId }).from(notes).where(eq(notes.id, comment.noteId)).limit(1);
      if (comment.userId !== actorId && owner?.userId !== actorId) return { ok: false, status: 404, code: "COMMENT_NOT_FOUND", message: "评论不存在" };
      const now = new Date();
      if (isD1Database(db)) {
        await db.batch([
          db.update(notes).set({ commentCount: sql`max(0, ${notes.commentCount} - 1)` }).where(eq(notes.id, comment.noteId)),
          db.update(noteComments).set({ deletedAt: now, updatedAt: now, version: comment.version + 1 }).where(eq(noteComments.id, commentId)),
        ]);
      } else {
        database.transaction((tx) => {
          tx.update(notes).set({ commentCount: sql`max(0, ${notes.commentCount} - 1)` }).where(eq(notes.id, comment.noteId)).run();
          tx.update(noteComments).set({ deletedAt: now, updatedAt: now, version: comment.version + 1 }).where(eq(noteComments.id, commentId)).run();
        });
      }
      return { ok: true, value: { id: commentId } };
    },
  };
}

export type CommentRepository = ReturnType<typeof createCommentRepository>;
