import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createDraftHandlers } from "../../app/api/drafts/[problemRef]/route";
import { createDraftRepository } from "../../app/server/problems/draft-repository";
import { createProblemRepository } from "../../app/server/problems/problem-repository";
import { createLocalDb } from "../../db/client";
import { users } from "../../db/schema";

function request(problemRef: string, method = "GET", body?: unknown) {
  return new Request(`http://localhost/api/drafts/${problemRef}?problemKind=public&language=cpp`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("code draft API", () => {
  let db: ReturnType<typeof createLocalDb>;
  let repository: ReturnType<typeof createDraftRepository>;
  let userId: string | null;
  let context: () => Promise<{ userId: string; repository: typeof repository } | null>;

  beforeEach(async () => {
    db = createLocalDb(":memory:");
    migrate(db, { migrationsFolder: "drizzle" });
    const now = new Date();
    await db.insert(users).values([
      { id: "user-a", name: "A", email: "a@example.com", emailVerified: true, createdAt: now, updatedAt: now },
      { id: "user-b", name: "B", email: "b@example.com", emailVerified: true, createdAt: now, updatedAt: now },
    ]);
    repository = createDraftRepository(db);
    userId = "user-a";
    context = async () => userId ? { userId, repository } : null;
  });

  it("returns 401 to anonymous users", async () => {
    userId = null;
    expect((await createDraftHandlers(context).GET(request("P1001"), "P1001")).status).toBe(401);
  });

  it("inserts at version 1, updates to version 2, and rejects stale updates", async () => {
    const handlers = createDraftHandlers(context);
    const inserted = await handlers.PUT(request("P1001", "PUT", { problemKind: "public", language: "cpp", sourceCode: "v1", expectedVersion: 0 }), "P1001");
    expect(inserted.status).toBe(200);
    expect(await inserted.json()).toMatchObject({ version: 1, draft: { sourceCode: "v1" } });
    const updated = await handlers.PUT(request("P1001", "PUT", { problemKind: "public", language: "cpp", sourceCode: "v2", expectedVersion: 1 }), "P1001");
    expect(await updated.json()).toMatchObject({ version: 2, draft: { sourceCode: "v2" } });
    const stale = await handlers.PUT(request("P1001", "PUT", { problemKind: "public", language: "cpp", sourceCode: "stale", expectedVersion: 1 }), "P1001");
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { currentVersion: 2, updatedAt: expect.any(String) } });
  });

  it("keeps languages and public/private namespaces unique", async () => {
    const problemRepository = createProblemRepository(db);
    const created = await problemRepository.createProblem("user-a", {
      problemCode: "PRIVATE", title: "Private", difficulty: "入门", timeLimit: "1s", memoryLimit: "64MB",
      description: "private", inputFormat: "input", outputFormat: "output",
    });
    if (!created.ok) throw new Error(created.message);
    const ref = created.value.id;
    expect((await repository.saveDraft("user-a", { problemKind: "private", problemRef: ref, language: "cpp", sourceCode: "private" }, 0)).ok).toBe(true);
    expect((await repository.saveDraft("user-a", { problemKind: "public", problemRef: ref, language: "cpp", sourceCode: "public" }, 0)).ok).toBe(true);
    expect((await repository.saveDraft("user-a", { problemKind: "public", problemRef: ref, language: "python", sourceCode: "python" }, 0)).ok).toBe(true);
  });

  it("does not let another user save a draft for a private problem", async () => {
    const problemRepository = createProblemRepository(db);
    const created = await problemRepository.createProblem("user-a", {
      problemCode: "PRIVATE", title: "Private", difficulty: "入门", timeLimit: "1s", memoryLimit: "64MB",
      description: "private", inputFormat: "input", outputFormat: "output",
    });
    if (!created.ok) throw new Error(created.message);
    const result = await repository.saveDraft("user-b", { problemKind: "private", problemRef: created.value.id, language: "cpp", sourceCode: "stolen" }, 0);
    expect(result).toMatchObject({ ok: false, status: 404 });
  });
});
