import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createProblemRepository,
  type ProblemInput,
} from "../../app/server/problems/problem-repository";
import { validateTestCases } from "../../app/server/problems/problem-validation";
import { createLocalDb } from "../../db/client";
import { users } from "../../db/schema";

const baseProblem: ProblemInput = {
  problemCode: "CF0001",
  title: "A + B",
  difficulty: "入门",
  timeLimit: "1000 ms",
  memoryLimit: "128 MB",
  description: "Add two integers.",
  inputFormat: "Two integers.",
  outputFormat: "Their sum.",
};

describe("user-scoped problem repository", () => {
  let db: ReturnType<typeof createLocalDb>;
  let repository: ReturnType<typeof createProblemRepository>;

  beforeEach(async () => {
    db = createLocalDb(":memory:");
    migrate(db, { migrationsFolder: "drizzle" });
    const now = new Date();
    await db.insert(users).values([
      { id: "user-a", name: "A", email: "a@example.com", emailVerified: true, createdAt: now, updatedAt: now },
      { id: "user-b", name: "B", email: "b@example.com", emailVerified: true, createdAt: now, updatedAt: now },
    ]);
    repository = createProblemRepository(db);
  });

  it("allows the same problem code for different users", async () => {
    expect((await repository.createProblem("user-a", baseProblem)).ok).toBe(true);
    expect((await repository.createProblem("user-b", baseProblem)).ok).toBe(true);
  });

  it("rejects a duplicate problem code within one user", async () => {
    await repository.createProblem("user-a", baseProblem);
    const duplicate = await repository.createProblem("user-a", baseProblem);
    expect(duplicate).toMatchObject({ ok: false, status: 409, code: "PROBLEM_CODE_EXISTS" });
  });

  it("never lets another user read or update a private problem", async () => {
    const created = await repository.createProblem("user-a", baseProblem);
    if (!created.ok) throw new Error(created.message);

    expect(await repository.getProblem("user-b", created.value.id)).toBeNull();
    expect(await repository.updateProblem("user-b", created.value.id, 1, { title: "stolen" }))
      .toMatchObject({ ok: false, status: 404 });
  });

  it("hides soft-deleted problems from reads and lists", async () => {
    const created = await repository.createProblem("user-a", baseProblem);
    if (!created.ok) throw new Error(created.message);
    expect((await repository.softDeleteProblem("user-a", created.value.id, 1)).ok).toBe(true);

    expect(await repository.getProblem("user-a", created.value.id)).toBeNull();
    expect((await repository.listProblems("user-a")).items).toHaveLength(0);
  });

  it("rejects stale versions with the current version and update time", async () => {
    const created = await repository.createProblem("user-a", baseProblem);
    if (!created.ok) throw new Error(created.message);
    const updated = await repository.updateProblem("user-a", created.value.id, 1, { title: "new title" });
    expect(updated.ok).toBe(true);

    const stale = await repository.updateProblem("user-a", created.value.id, 1, { title: "stale title" });
    expect(stale).toMatchObject({ ok: false, status: 409, code: "VERSION_CONFLICT", currentVersion: 2 });
    expect(stale).toHaveProperty("updatedAt");
  });

  it("replaces test cases once and increments the parent version exactly once", async () => {
    const created = await repository.createProblem("user-a", baseProblem);
    if (!created.ok) throw new Error(created.message);
    const saved = await repository.replaceTestCases("user-a", created.value.id, 1, [
      { input: "1 2", expectedOutput: "3" },
      { input: "4 5", expectedOutput: "9" },
    ]);
    expect(saved).toMatchObject({ ok: true, version: 2 });
    expect(saved.ok && saved.value).toHaveLength(2);
  });

  it("dissolves only one cloud folder level without losing problems or test cases", async () => {
    const parent = await repository.createFolder("user-a", { name: "parent" });
    if (!parent.ok) throw new Error(parent.message);
    const current = await repository.createFolder("user-a", { name: "current", parentId: parent.value.id });
    if (!current.ok) throw new Error(current.message);
    const child = await repository.createFolder("user-a", { name: "child", parentId: current.value.id });
    if (!child.ok) throw new Error(child.message);
    const created = await repository.createProblem("user-a", { ...baseProblem, folderId: current.value.id });
    if (!created.ok) throw new Error(created.message);
    const saved = await repository.replaceTestCases("user-a", created.value.id, 1, [
      { input: "1 2\n", expectedOutput: "3\n", category: "sample", targets: "must survive" },
    ]);
    if (!saved.ok) throw new Error(saved.message);

    const deleted = await repository.deleteFolder("user-a", current.value.id);

    expect(deleted.ok).toBe(true);
    const remainingFolders = await repository.listFolders("user-a");
    expect(remainingFolders.find((folder) => folder.id === child.value.id)?.parentId).toBe(parent.value.id);
    const preserved = await repository.getProblem("user-a", created.value.id);
    expect(preserved?.folderId).toBe(parent.value.id);
    expect(preserved?.testCases).toHaveLength(1);
    expect(preserved?.testCases[0]).toMatchObject({ input: "1 2\n", expectedOutput: "3\n", targets: "must survive" });
  });
});

describe("problem payload limits", () => {
  it("rejects a test input or output larger than 512 KiB", () => {
    const result = validateTestCases([{ input: "x".repeat(512 * 1024 + 1), expectedOutput: "ok" }]);
    expect(result).toMatchObject({ ok: false, code: "TEST_CASE_TOO_LARGE" });
  });

  it("rejects total test data larger than 20 MiB", () => {
    const block = "x".repeat(512 * 1024);
    const result = validateTestCases(Array.from({ length: 41 }, () => ({ input: block, expectedOutput: "" })));
    expect(result).toMatchObject({ ok: false, code: "PROBLEM_TEST_DATA_TOO_LARGE" });
  });
});
