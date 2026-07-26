import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createNoteDetailHandlers } from "../../app/api/notes/[id]/route";
import { createNotesHandlers } from "../../app/api/notes/route";
import { createNoteRepository } from "../../app/server/notes/note-repository";
import { createLocalDb } from "../../db/client";
import { users } from "../../db/schema";

describe("note APIs (private)", () => {
  let db: ReturnType<typeof createLocalDb>;
  let repository: ReturnType<typeof createNoteRepository>;
  let userId: string | null;
  let resolve: () => Promise<{ userId: string; repository: typeof repository } | null>;
  let publicResolve: () => Promise<typeof repository>;

  beforeEach(async () => {
    db = createLocalDb(":memory:");
    migrate(db, { migrationsFolder: "drizzle" });
    const now = new Date();
    await db.insert(users).values([
      { id: "user-a", name: "A", email: "a@example.com", emailVerified: true, createdAt: now, updatedAt: now },
      { id: "user-b", name: "B", email: "b@example.com", emailVerified: true, createdAt: now, updatedAt: now },
    ]);
    repository = createNoteRepository(db);
    userId = "user-a";
    resolve = async () => userId ? { userId, repository } : null;
    publicResolve = async () => repository;
  });

  it("rejects anonymous access", async () => {
    userId = null;
    expect((await createNotesHandlers(resolve, publicResolve).GET(request("/api/notes"))).status).toBe(401);
    expect((await createNotesHandlers(resolve, publicResolve).POST(request("/api/notes", "POST", { title: "n", content: "c" }))).status).toBe(401);
    // 游客可尝试公开读，不存在的笔记统一 404（不泄漏存在性）
    expect((await createNoteDetailHandlers(resolve, publicResolve).GET(request("/api/notes/x"), "x")).status).toBe(404);
  });

  it("serves published public notes to guests and hides private ones", async () => {
    const notes = createNotesHandlers(resolve, publicResolve);
    const pub = await notes.POST(request("/api/notes", "POST", { title: "公开题解", content: "hi", visibility: "public", status: "published" }));
    const pubNote = (await pub.json()).note as { id: string };
    const priv = await notes.POST(request("/api/notes", "POST", { title: "私有", content: "secret" }));
    const privNote = (await priv.json()).note as { id: string };

    userId = null; // 切换为游客
    const square = await (await createNotesHandlers(resolve, publicResolve).GET(request("/api/notes?view=public"))).json();
    const ids = square.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(pubNote.id);
    expect(ids).not.toContain(privNote.id);
    expect(square.items[0]).toHaveProperty("author");
    expect(JSON.stringify(square.items)).not.toContain("userId");

    const detail = createNoteDetailHandlers(resolve, publicResolve);
    const pubDetail = await detail.GET(request(`/api/notes/${pubNote.id}`), pubNote.id);
    expect(pubDetail.status).toBe(200);
    expect(pubDetail.headers.get("Cache-Control")).toBe("no-store");
    expect((await pubDetail.json()).note).not.toHaveProperty("userId");
    expect((await detail.GET(request(`/api/notes/${privNote.id}`), privNote.id)).status).toBe(404);
  });

  it("creates, reads, updates and paginates notes with private cache headers", async () => {
    const notes = createNotesHandlers(resolve, publicResolve);
    const created = await notes.POST(request("/api/notes", "POST", { title: "第一篇", content: "# hi" }));
    expect(created.status).toBe(201);
    expect(created.headers.get("Cache-Control")).toBe("private, no-store");
    const note = (await created.json()).note as { id: string; version: number };

    const detail = createNoteDetailHandlers(resolve, publicResolve);
    const got = await detail.GET(request(`/api/notes/${note.id}`), note.id);
    expect((await got.json()).note).toMatchObject({ title: "第一篇", content: "# hi" });

    const patched = await detail.PATCH(request(`/api/notes/${note.id}`, "PATCH", { version: 1, title: "改名" }), note.id);
    expect(await patched.json()).toMatchObject({ note: { title: "改名", version: 2 }, version: 2 });

    for (const title of ["二", "三"]) await notes.POST(request("/api/notes", "POST", { title, content: "x" }));
    const page = await (await notes.GET(request("/api/notes?limit=2"))).json();
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeTruthy();
    expect(JSON.stringify(page.items)).not.toContain("\"content\"");
  });

  it("rejects unknown fields, client userId, stale version and oversize content", async () => {
    const notes = createNotesHandlers(resolve, publicResolve);
    expect((await notes.POST(request("/api/notes", "POST", { title: "n", content: "c", userId: "user-b" }))).status).toBe(400);
    expect((await notes.POST(request("/api/notes", "POST", { title: "n", content: "c", evil: 1 }))).status).toBe(400);
    expect((await notes.POST(request("/api/notes", "POST", { title: "big", content: "x".repeat(512 * 1024 + 1) }))).status).toBe(413);
    const created = await notes.POST(request("/api/notes", "POST", { title: "v", content: "c" }));
    const note = (await created.json()).note as { id: string };
    const detail = createNoteDetailHandlers(resolve, publicResolve);
    expect((await detail.PATCH(request(`/api/notes/${note.id}`, "PATCH", { version: 99, title: "x" }), note.id)).status).toBe(409);
  });

  it("returns 404 for cross-user note identifiers", async () => {
    const created = await createNotesHandlers(resolve, publicResolve).POST(request("/api/notes", "POST", { title: "私有", content: "c" }));
    const note = (await created.json()).note as { id: string };
    userId = "user-b";
    const detail = createNoteDetailHandlers(resolve, publicResolve);
    expect((await detail.GET(request(`/api/notes/${note.id}`), note.id)).status).toBe(404);
    expect((await detail.PATCH(request(`/api/notes/${note.id}`, "PATCH", { version: 1, title: "attack" }), note.id)).status).toBe(404);
    expect((await detail.DELETE(request(`/api/notes/${note.id}?version=1`, "DELETE"), note.id)).status).toBe(404);
  });

  it("soft deletes with version and removes from listing", async () => {
    const notes = createNotesHandlers(resolve, publicResolve);
    const created = await notes.POST(request("/api/notes", "POST", { title: "n", content: "c" }));
    const note = (await created.json()).note as { id: string };
    const detail = createNoteDetailHandlers(resolve, publicResolve);
    expect((await detail.DELETE(request(`/api/notes/${note.id}?version=1`, "DELETE"), note.id)).status).toBe(200);
    const page = await (await notes.GET(request("/api/notes"))).json();
    expect(page.items).toHaveLength(0);
  });

  function request(path: string, method = "GET", body?: unknown) {
    return new Request(`http://localhost${path}`, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
});
