import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createNoteRepository } from "../../app/server/notes/note-repository";
import { createLocalDb } from "../../db/client";
import { notes, problems, users } from "../../db/schema";

describe("note repository (private CRUD)", () => {
  let db: ReturnType<typeof createLocalDb>;
  let repository: ReturnType<typeof createNoteRepository>;

  beforeEach(async () => {
    db = createLocalDb(":memory:");
    migrate(db, { migrationsFolder: "drizzle" });
    const now = new Date();
    await db.insert(users).values([
      { id: "user-a", name: "A", email: "a@example.com", emailVerified: true, createdAt: now, updatedAt: now },
      { id: "user-b", name: "B", email: "b@example.com", emailVerified: true, createdAt: now, updatedAt: now },
    ]);
    await db.insert(problems).values({
      id: "prob-a", userId: "user-a", problemCode: "A1", title: "题目", difficulty: "简单",
      timeLimit: "1s", memoryLimit: "256MB", description: "d", inputFormat: "i", outputFormat: "o",
      version: 1, createdAt: now, updatedAt: now,
    });
    repository = createNoteRepository(db);
  });

  it("creates a note and strips owner id from output", async () => {
    const result = await repository.create("user-a", { title: "第一篇", content: "# 内容" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toHaveProperty("userId");
    expect(result.value).toMatchObject({ title: "第一篇", visibility: "private", status: "draft", source: "standalone", version: 1 });
    expect(result.version).toBe(1);
  });

  it("rejects unknown fields, blank titles, oversize content and credential-shaped payloads", async () => {
    expect((await repository.create("user-a", { title: "x", content: "y", evil: 1 })).ok).toBe(false);
    expect((await repository.create("user-a", { title: "   ", content: "y" }) as { code: string }).code).toBe("INVALID_TITLE");
    const big = await repository.create("user-a", { title: "big", content: "x".repeat(512 * 1024 + 1) });
    expect(big).toMatchObject({ status: 413, code: "CONTENT_TOO_LARGE" });
    const secret = await repository.create("user-a", { title: "s", content: "ok", apiKey: "sk-secret" } as Record<string, unknown>);
    expect(secret.ok).toBe(false);
    expect(JSON.stringify(await db.select().from(notes))).not.toContain("sk-secret");
  });

  it("validates problem-bound notes against ownership", async () => {
    const owned = await repository.create("user-a", { title: "题解", content: "sol", source: "problem", problemKind: "private", problemRef: "prob-a" });
    expect(owned.ok).toBe(true);
    const foreign = await repository.create("user-b", { title: "偷题", content: "x", source: "problem", problemKind: "private", problemRef: "prob-a" });
    expect(foreign).toMatchObject({ status: 400, code: "INVALID_PROBLEM_REF" });
    const publicRef = await repository.create("user-a", { title: "公共题解", content: "x", source: "problem", problemKind: "public", problemRef: "CF1000A" });
    expect(publicRef.ok).toBe(true);
  });

  it("isolates notes per user and returns 404 across users", async () => {
    const created = await repository.create("user-a", { title: "私有", content: "x" });
    if (!created.ok) throw new Error("setup failed");
    expect((await repository.get("user-b", created.value.id)).ok).toBe(false);
    expect((await repository.update("user-b", created.value.id, 1, { title: "篡改" })).ok).toBe(false);
    expect((await repository.softDelete("user-b", created.value.id, 1)).ok).toBe(false);
    expect((await repository.get("user-a", created.value.id)).ok).toBe(true);
  });

  it("updates conditionally with version CAS and reports conflicts", async () => {
    const created = await repository.create("user-a", { title: "v1", content: "x" });
    if (!created.ok) throw new Error("setup failed");
    const updated = await repository.update("user-a", created.value.id, 1, { title: "v2" });
    expect(updated).toMatchObject({ ok: true, version: 2 });
    const stale = await repository.update("user-a", created.value.id, 1, { title: "stale" });
    expect(stale).toMatchObject({ status: 409, code: "VERSION_CONFLICT", currentVersion: 2 });
  });

  it("soft deletes and hides from listing", async () => {
    const a = await repository.create("user-a", { title: "n1", content: "x" });
    await repository.create("user-a", { title: "n2", content: "y" });
    if (!a.ok) throw new Error("setup failed");
    const removed = await repository.softDelete("user-a", a.value.id, 1);
    expect(removed.ok).toBe(true);
    const list = await repository.list("user-a");
    expect(list.items).toHaveLength(1);
    expect(list.items.find((item) => item.id === a.value.id)).toBeUndefined();
    expect(JSON.stringify(list.items)).not.toContain("content");
  });

  it("paginates by updatedAt|id cursor", async () => {
    for (const title of ["a", "b", "c"]) {
      await repository.create("user-a", { title, content: "x" });
    }
    const first = await repository.list("user-a", { requestedLimit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = await repository.list("user-a", { requestedLimit: 2, cursor: first.nextCursor });
    expect(second.items).toHaveLength(1);
  });
});
