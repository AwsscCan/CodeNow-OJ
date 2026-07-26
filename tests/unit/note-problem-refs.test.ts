import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createNoteRepository } from "../../app/server/notes/note-repository";
import { createLocalDb } from "../../db/client";
import { problems, users } from "../../db/schema";

describe("note body problem references", () => {
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
      id: "prob-a", userId: "user-a", problemCode: "A1", title: "题", difficulty: "简单",
      timeLimit: "1s", memoryLimit: "256MB", description: "d", inputFormat: "i", outputFormat: "o",
      version: 1, createdAt: now, updatedAt: now,
    });
    repository = createNoteRepository(db);
  });

  it("stores ordered references atomically with the note", async () => {
    const created = await repository.create("user-a", {
      title: "题解", content: "sol",
      problemRefs: [{ problemKind: "public", problemRef: "CF1A" }, { problemKind: "private", problemRef: "prob-a" }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const detail = await repository.get("user-a", created.value.id);
    if (!detail.ok) throw new Error("get failed");
    expect(detail.value.problemRefs).toEqual([
      { problemKind: "public", problemRef: "CF1A", sortOrder: 0 },
      { problemKind: "private", problemRef: "prob-a", sortOrder: 1 },
    ]);
  });

  it("rejects foreign private references and oversize arrays", async () => {
    const foreign = await repository.create("user-b", { title: "偷", content: "x", problemRefs: [{ problemKind: "private", problemRef: "prob-a" }] });
    expect(foreign).toMatchObject({ status: 400, code: "INVALID_PROBLEM_REF" });
    const tooMany = await repository.create("user-a", { title: "多", content: "x", problemRefs: Array.from({ length: 51 }, () => ({ problemKind: "public", problemRef: "X" })) });
    expect(tooMany).toMatchObject({ status: 413, code: "PROBLEM_REFS_TOO_MANY" });
  });

  it("replaces references only when the array is provided", async () => {
    const created = await repository.create("user-a", { title: "t", content: "x", problemRefs: [{ problemKind: "public", problemRef: "A" }] });
    if (!created.ok) throw new Error("setup failed");
    // 不带 problemRefs 的更新不动引用
    const patched = await repository.update("user-a", created.value.id, 1, { title: "t2" });
    expect(patched.ok).toBe(true);
    let detail = await repository.get("user-a", created.value.id);
    if (!detail.ok) throw new Error("get failed");
    expect(detail.value.problemRefs).toHaveLength(1);
    // 带 problemRefs 的更新整体替换
    const replaced = await repository.update("user-a", created.value.id, 2, { problemRefs: [{ problemKind: "public", problemRef: "B" }, { problemKind: "public", problemRef: "C" }] });
    expect(replaced.ok).toBe(true);
    detail = await repository.get("user-a", created.value.id);
    if (!detail.ok) throw new Error("get failed");
    expect(detail.value.problemRefs.map((ref) => ref.problemRef)).toEqual(["B", "C"]);
  });
});
