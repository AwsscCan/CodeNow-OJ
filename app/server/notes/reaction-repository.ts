import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../../../db/client";
import { createLocalDb } from "../../../db/client";
import { noteReactions, notes } from "../../../db/schema";

type RepositoryDb = ReturnType<typeof createLocalDb>;
type ReactionKind = "like" | "favorite";
type ErrorResult = { ok: false; status: 400 | 404; code: string; message: string };
type Result<T> = { ok: true; value: T } | ErrorResult;

export function createReactionRepository(db: Database) {
  const database = db as RepositoryDb;

  /** 决策 8：like 仅公开可见笔记；favorite 允许公开笔记或作者本人的自有私有笔记。 */
  async function reactableNote(userId: string, noteId: string, kind: ReactionKind) {
    const [note] = await database.select().from(notes).where(and(eq(notes.id, noteId), isNull(notes.deletedAt))).limit(1);
    if (!note) return null;
    const publicVisible = note.visibility === "public" && note.status === "published" && note.moderationState === "visible";
    if (publicVisible) return note;
    if (kind === "favorite" && note.userId === userId) return note;
    return null;
  }

  async function countOf(noteId: string, kind: ReactionKind) {
    const [row] = await database.select({ value: sql<number>`count(*)` }).from(noteReactions)
      .where(and(eq(noteReactions.noteId, noteId), eq(noteReactions.kind, kind)));
    return Number(row?.value ?? 0);
  }

  return {
    async set(userId: string, noteId: string, kind: unknown, active: boolean): Promise<Result<{ kind: ReactionKind; active: boolean; count: number }>> {
      if (kind !== "like" && kind !== "favorite") return { ok: false, status: 400, code: "INVALID_KIND", message: "反应类型无效" };
      const note = await reactableNote(userId, noteId, kind);
      if (!note) return { ok: false, status: 404, code: "NOTE_NOT_FOUND", message: "笔记不存在或不可交互" };
      if (active) await database.insert(noteReactions).values({ userId, noteId, kind, createdAt: new Date() }).onConflictDoNothing();
      else await database.delete(noteReactions).where(and(eq(noteReactions.userId, userId), eq(noteReactions.noteId, noteId), eq(noteReactions.kind, kind)));
      const count = await countOf(noteId, kind);
      await database.update(notes).set(kind === "like" ? { likeCount: count } : { favoriteCount: count }).where(eq(notes.id, noteId));
      return { ok: true, value: { kind, active, count } };
    },

    async viewerState(userId: string, noteId: string) {
      const rows = await database.select({ kind: noteReactions.kind }).from(noteReactions)
        .where(and(eq(noteReactions.userId, userId), eq(noteReactions.noteId, noteId)));
      return {
        viewerLiked: rows.some((row) => row.kind === "like"),
        viewerFavorited: rows.some((row) => row.kind === "favorite"),
      };
    },
  };
}

export type ReactionRepository = ReturnType<typeof createReactionRepository>;
