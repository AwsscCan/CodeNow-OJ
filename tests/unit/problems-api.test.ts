import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createFolderHandlers } from "../../app/api/folders/route";
import { createProblemDetailHandlers } from "../../app/api/problems/[id]/route";
import { createTestCaseHandlers } from "../../app/api/problems/[id]/test-cases/route";
import { createProblemsHandlers } from "../../app/api/problems/route";
import { createProblemRepository } from "../../app/server/problems/problem-repository";
import { createLocalDb } from "../../db/client";
import { users } from "../../db/schema";

const problem = {
  problemCode: "CF0001", title: "A + B", difficulty: "入门", timeLimit: "1000 ms", memoryLimit: "128 MB",
  description: "Add two integers.", inputFormat: "Two integers.", outputFormat: "Their sum.",
};

function request(path: string, method = "GET", body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("private problem APIs", () => {
  let db: ReturnType<typeof createLocalDb>;
  let repository: ReturnType<typeof createProblemRepository>;
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
    repository = createProblemRepository(db);
    userId = "user-a";
    context = async () => userId ? { userId, repository } : null;
  });

  it("returns 401 for anonymous list and create requests", async () => {
    userId = null;
    const handlers = createProblemsHandlers(context);
    expect((await handlers.GET(request("/api/problems"))).status).toBe(401);
    expect((await handlers.POST(request("/api/problems", "POST", problem))).status).toBe(401);
  });

  it("creates and reads only the current user's problem", async () => {
    const collection = createProblemsHandlers(context);
    const createdResponse = await collection.POST(request("/api/problems", "POST", problem));
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json() as { problem: { id: string } };

    const detail = createProblemDetailHandlers(context);
    expect((await detail.GET(request(`/api/problems/${created.problem.id}`), created.problem.id)).status).toBe(200);
    userId = "user-b";
    expect((await detail.GET(request(`/api/problems/${created.problem.id}`), created.problem.id)).status).toBe(404);
  });

  it("maps invalid, stale, and oversized writes to 400, 409, and 413", async () => {
    const collection = createProblemsHandlers(context);
    expect((await collection.POST(request("/api/problems", "POST", { title: "missing fields" }))).status).toBe(400);
    const created = await (await collection.POST(request("/api/problems", "POST", problem))).json() as { problem: { id: string } };
    const detail = createProblemDetailHandlers(context);
    const stale = await detail.PATCH(request(`/api/problems/${created.problem.id}`, "PATCH", { version: 99, patch: { title: "stale" } }), created.problem.id);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { currentVersion: 1 } });
    const tests = createTestCaseHandlers(context);
    const oversized = [{ input: "x".repeat(512 * 1024 + 1), expectedOutput: "ok" }];
    expect((await tests.PUT(request(`/api/problems/${created.problem.id}/test-cases`, "PUT", { version: 1, testCases: oversized }), created.problem.id)).status).toBe(413);
  });

  it("omits test input and output bodies from problem lists", async () => {
    const collection = createProblemsHandlers(context);
    const created = await (await collection.POST(request("/api/problems", "POST", problem))).json() as { problem: { id: string } };
    await createTestCaseHandlers(context).PUT(request(`/api/problems/${created.problem.id}/test-cases`, "PUT", {
      version: 1, testCases: [{ input: "secret-input", expectedOutput: "secret-output" }],
    }), created.problem.id);
    const body = await (await collection.GET(request("/api/problems"))).text();
    expect(body).not.toContain("secret-input");
    expect(body).not.toContain("secret-output");
  });

  it("moves problems to a deleted folder's parent without deleting them", async () => {
    const folders = createFolderHandlers(context);
    const parent = await (await folders.POST(request("/api/folders", "POST", { name: "parent" }))).json() as { folder: { id: string } };
    const child = await (await folders.POST(request("/api/folders", "POST", { name: "child", parentId: parent.folder.id }))).json() as { folder: { id: string } };
    const collection = createProblemsHandlers(context);
    const created = await (await collection.POST(request("/api/problems", "POST", { ...problem, folderId: child.folder.id }))).json() as { problem: { id: string } };

    expect((await folders.DELETE(request(`/api/folders?id=${child.folder.id}`, "DELETE"))).status).toBe(200);
    const saved = await repository.getProblem("user-a", created.problem.id);
    expect(saved?.folderId).toBe(parent.folder.id);
  });
});
