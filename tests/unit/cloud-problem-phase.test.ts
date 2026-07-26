import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import { createProblemRepository } from "../../app/server/problems/problem-repository";
import { createLocalDb } from "../../db/client";
import { users } from "../../db/schema";

const input = {
  problemCode: "CF0001", title: "Phase gate", difficulty: "入门", timeLimit: "1000 ms", memoryLimit: "128 MB",
  description: "Disposable persistence verification.", inputFormat: "Input.", outputFormat: "Output.",
};

describe("cloud problem persistence phase gate", () => {
  it("isolates two users, saves 200 tests, limits bodies, redacts lists, and hides deletion", async () => {
    const db = createLocalDb(":memory:");
    migrate(db, { migrationsFolder: "drizzle" });
    const now = new Date();
    await db.insert(users).values([
      { id: "phase-a", name: "A", email: "phase-a@example.com", emailVerified: true, createdAt: now, updatedAt: now },
      { id: "phase-b", name: "B", email: "phase-b@example.com", emailVerified: true, createdAt: now, updatedAt: now },
    ]);
    const repository = createProblemRepository(db);
    const createdA = await repository.createProblem("phase-a", input);
    const createdB = await repository.createProblem("phase-b", input);
    expect(createdA.ok && createdB.ok).toBe(true);
    if (!createdA.ok || !createdB.ok) return;

    const cases = Array.from({ length: 200 }, (_, index) => ({ input: `${index}\nprivate-input`, expectedOutput: `${index}\n` }));
    const saved = await repository.replaceTestCases("phase-a", createdA.value.id, 1, cases);
    expect(saved).toMatchObject({ ok: true, version: 2 });
    expect(saved.ok && saved.value).toHaveLength(200);
    expect((await repository.getProblem("phase-b", createdA.value.id))).toBeNull();

    const oversized = await repository.replaceTestCases("phase-a", createdA.value.id, 2, [{ input: "x".repeat(513 * 1024), expectedOutput: "x" }]);
    expect(oversized).toMatchObject({ ok: false, status: 413 });
    const listText = JSON.stringify(await repository.listProblems("phase-a"));
    expect(listText).not.toContain("private-input");
    expect(listText).not.toContain("expectedOutput");

    expect((await repository.softDeleteProblem("phase-a", createdA.value.id, 2)).ok).toBe(true);
    expect(await repository.getProblem("phase-a", createdA.value.id)).toBeNull();
  });
});
