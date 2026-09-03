import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createSubmissionHandlers } from "../../app/api/submissions/route";
import { createSubmissionRepository } from "../../db";
import * as schema from "../../db/schema";

function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("submissions API ownership", () => {
  let sqlite: BetterSqlite3.Database;
  let repository: ReturnType<typeof createSubmissionRepository>;

  beforeEach(() => {
    sqlite = new BetterSqlite3(":memory:");
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "drizzle" });
    const now = new Date();
    db.insert(schema.users).values([
      { id: "user-a", name: "A", email: "a@example.com", emailVerified: true, createdAt: now, updatedAt: now },
      { id: "user-b", name: "B", email: "b@example.com", emailVerified: true, createdAt: now, updatedAt: now },
    ]).run();
    repository = createSubmissionRepository(db);
  });

  it("rejects anonymous reads and writes", async () => {
    const handlers = createSubmissionHandlers(async () => null);
    expect((await handlers.GET(jsonRequest("http://localhost/api/submissions?problemId=P1", "GET"))).status).toBe(401);
    expect((await handlers.POST(jsonRequest("http://localhost/api/submissions", "POST", {}))).status).toBe(401);
  });

  it("creates server-owned records and isolates them from another user", async () => {
    const handlersA = createSubmissionHandlers(async () => ({ userId: "user-a", repository }));
    const handlersB = createSubmissionHandlers(async () => ({ userId: "user-b", repository }));
    const clientId = "client-controlled-id";
    const createResponse = await handlersA.POST(jsonRequest("http://localhost/api/submissions", "POST", {
      id: clientId,
      userId: "user-b",
      problemId: "P1001",
      problemTitle: "A+B",
      status: "答案正确",
      passed: "3/3",
      sourceCode: "int main(){}",
      results: [
        { id: 1, status: "AC", actual: "3", expected: "3", duration: 12 },
        { id: 2, status: "WA", actual: "4", expected: "5", duration: 18 },
      ],
      totalDurationMs: 30,
      submittedAt: "2000-01-01T00:00:00.000Z",
    }));
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { record: { id: string; submittedAt: string; results: unknown[]; totalDurationMs: number } };
    expect(created.record.id).not.toBe(clientId);
    expect(created.record.submittedAt).not.toBe("2000-01-01T00:00:00.000Z");
    expect(created.record.results).toMatchObject([
      { status: "AC", duration: 12 },
      { status: "WA", actual: "4", expected: "5", duration: 18 },
    ]);
    expect(created.record.totalDurationMs).toBe(30);

    const own = await handlersA.GET(jsonRequest("http://localhost/api/submissions?problemId=P1001", "GET"));
    expect((await own.json() as { history: unknown[] }).history).toHaveLength(1);
    const other = await handlersB.GET(jsonRequest("http://localhost/api/submissions?problemId=P1001", "GET"));
    expect((await other.json() as { history: unknown[] }).history).toHaveLength(0);
    expect((await handlersB.DELETE(jsonRequest(`http://localhost/api/submissions?id=${created.record.id}`, "DELETE"))).status).toBe(404);
    expect((await handlersA.DELETE(jsonRequest(`http://localhost/api/submissions?id=${created.record.id}`, "DELETE"))).status).toBe(200);
  });
});
