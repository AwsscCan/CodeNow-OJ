import { count, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createCommentRepository } from "../../app/server/notes/comment-repository";
import { createNoteRepository } from "../../app/server/notes/note-repository";
import { createReactionRepository } from "../../app/server/notes/reaction-repository";
import { createReportRepository } from "../../app/server/notes/report-repository";
import { createLocalDb } from "../../db/client";
import { noteComments, noteReactions, notes, users } from "../../db/schema";

describe("note comments and reactions", () => {
  let db: ReturnType<typeof createLocalDb>;
  let noteRepo: ReturnType<typeof createNoteRepository>;
  let comments: ReturnType<typeof createCommentRepository>;
  let reactions: ReturnType<typeof createReactionRepository>;
  let publicId: string;
  let privateId: string;

  beforeEach(async () => {
    db = createLocalDb(":memory:");
    migrate(db, { migrationsFolder: "drizzle" });
    const now = new Date();
    await db.insert(users).values([
      { id: "author", name: "作者", email: "a@example.com", emailVerified: true, createdAt: now, updatedAt: now },
      { id: "reader", name: "读者", email: "b@example.com", emailVerified: true, createdAt: now, updatedAt: now },
    ]);
    noteRepo = createNoteRepository(db);
    comments = createCommentRepository(db);
    reactions = createReactionRepository(db);
    const pub = await noteRepo.create("author", { title: "公开题解", content: "hi", visibility: "public", status: "published" });
    const priv = await noteRepo.create("author", { title: "私有", content: "secret" });
    if (!pub.ok || !priv.ok) throw new Error("setup failed");
    publicId = pub.value.id;
    privateId = priv.value.id;
  });

  it("allows comments only on public notes and maintains comment_count", async () => {
    expect((await comments.create("reader", privateId, { content: "偷看" }, "k1"))).toMatchObject({ status: 404 });
    const created = await comments.create("reader", publicId, { content: "好题解" }, "k2");
    expect(created.ok).toBe(true);
    const [note] = await db.select({ commentCount: notes.commentCount }).from(notes).where(eq(notes.id, publicId));
    expect(note.commentCount).toBe(1);
  });

  it("is idempotent on repeated comment keys", async () => {
    const first = await comments.create("reader", publicId, { content: "同一条" }, "same");
    const again = await comments.create("reader", publicId, { content: "同一条" }, "same");
    expect(first).toEqual(again);
    expect((await db.select({ value: count() }).from(noteComments))[0].value).toBe(1);
  });

  it("lets comment author or note owner delete, others cannot", async () => {
    const created = await comments.create("reader", publicId, { content: "删我" }, "k3");
    if (!created.ok) throw new Error("setup failed");
    // 陌生人不能删
    await db.insert(users).values({ id: "stranger", name: "路人", email: "c@example.com", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
    expect(await comments.remove("stranger", created.value.id)).toMatchObject({ status: 404 });
    // 帖主可以删读者的评论
    expect((await comments.remove("author", created.value.id)).ok).toBe(true);
    const list = await comments.listByNote(publicId);
    if (!list.ok) throw new Error("list failed");
    expect(list.value.items).toHaveLength(0);
  });

  it("likes only public notes but favorites own private notes", async () => {
    expect(await reactions.set("reader", privateId, "like", true)).toMatchObject({ status: 404 });
    const liked = await reactions.set("reader", publicId, "like", true);
    expect(liked).toMatchObject({ ok: true, value: { kind: "like", count: 1 } });
    // 重复点赞幂等，计数不变
    await reactions.set("reader", publicId, "like", true);
    expect((await db.select({ value: count() }).from(noteReactions).where(eq(noteReactions.noteId, publicId)))[0].value).toBe(1);
    // 作者可收藏自己的私有笔记
    expect((await reactions.set("author", privateId, "favorite", true)).ok).toBe(true);
    // 读者不能收藏他人私有笔记
    expect(await reactions.set("reader", privateId, "favorite", true)).toMatchObject({ status: 404 });
    // 取消点赞
    const unliked = await reactions.set("reader", publicId, "like", false);
    expect(unliked).toMatchObject({ ok: true, value: { count: 0 } });
    expect(await reactions.viewerState("reader", publicId)).toEqual({ viewerLiked: false, viewerFavorited: false });
  });

  it("accepts reports on public content only and dedupes per reporter", async () => {
    const reports = createReportRepository(db);
    expect(await reports.create("reader", "note", privateId, "spam")).toMatchObject({ status: 404 });
    expect(await reports.create("reader", "note", publicId, "垃圾内容")).toMatchObject({ ok: true, value: { duplicated: false } });
    expect(await reports.create("reader", "note", publicId, "垃圾内容")).toMatchObject({ ok: true, value: { duplicated: true } });
  });
});
