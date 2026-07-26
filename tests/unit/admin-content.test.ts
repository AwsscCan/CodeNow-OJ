import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createAdminContentDetailHandlers } from "../../app/api/admin/content/[type]/[id]/route";
import { createAdminContentHandlers } from "../../app/api/admin/content/route";
import { createAdminContentService } from "../../app/server/admin/admin-content-service";
import { createConversationRepository } from "../../app/server/conversations/conversation-repository";
import { createDraftRepository } from "../../app/server/problems/draft-repository";
import { adminAuditLogs, aiConversations, codeDrafts, problems, users } from "../../db/schema";
import * as schema from "../../db/schema";

describe("administrator content moderation", () => {
  let sqlite: BetterSqlite3.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: ReturnType<typeof createAdminContentService>;

  beforeEach(() => {
    sqlite = new BetterSqlite3(":memory:");
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "drizzle" });
    const now = new Date();
    db.insert(users).values([
      { id: "admin-a", name: "Admin", email: "admin@example.test", emailVerified: true, role: "admin", createdAt: now, updatedAt: now },
      { id: "user-a", name: "A", email: "a@example.test", emailVerified: true, createdAt: now, updatedAt: now },
      { id: "user-b", name: "B", email: "b@example.test", emailVerified: true, createdAt: now, updatedAt: now },
    ]).run();
    db.insert(problems).values({
      id: "problem-a", userId: "user-a", problemCode: "P-A", title: "Private problem", difficulty: "入门",
      timeLimit: "1s", memoryLimit: "64MB", description: "secret problem", inputFormat: "in", outputFormat: "out",
      createdAt: now, updatedAt: now,
    }).run();
    db.insert(codeDrafts).values({
      id: "draft-a", userId: "user-a", problemKind: "private", problemRef: "problem-a", language: "cpp",
      sourceCode: "private source", createdAt: now, updatedAt: now,
    }).run();
    db.insert(aiConversations).values({
      id: "conversation-a", userId: "user-a", title: "Private chat", createdAt: now, updatedAt: now,
    }).run();
    service = createAdminContentService(db);
  });

  it("lists bounded metadata and loads details explicitly", async () => {
    const listed = await service.list("admin-a", "problem", null, 20);
    expect(listed).toMatchObject({ ok: true, value: { items: [{ id: "problem-a", userId: "user-a", title: "Private problem" }] } });
    expect(JSON.stringify(listed)).not.toContain("secret problem");

    const detail = await service.detail("admin-a", "draft", "draft-a");
    expect(detail).toMatchObject({ ok: true, value: { sourceCode: "private source" } });
    expect(await service.detail("user-b", "draft", "draft-a")).toMatchObject({ ok: false, status: 404 });
  });

  it.each([
    ["problem", "problem-a"],
    ["draft", "draft-a"],
    ["conversation", "conversation-a"],
  ] as const)("soft deletes and restores %s without exposing content in audits", async (type, id) => {
    expect(await service.setDeleted("admin-a", "delete-request", type, id, true)).toMatchObject({ ok: true });

    if (type === "draft") expect(await createDraftRepository(db).getDraft("user-a", "private", "problem-a", "cpp")).toBeNull();
    if (type === "conversation") expect((await createConversationRepository(db).list("user-a")).items).toHaveLength(0);

    expect(await service.setDeleted("admin-a", "restore-request", type, id, false)).toMatchObject({ ok: true });
    expect(JSON.stringify(await db.select().from(adminAuditLogs))).not.toMatch(/private source|secret problem|Private chat/);
  });

  it("exposes no-store moderation routes only through an administrator resolver", async () => {
    const resolve = async () => ({ userId: "admin-a", services: { db } });
    const list = await createAdminContentHandlers(resolve).GET(new Request("http://localhost/api/admin/content?type=problem&limit=20"));
    expect(list.status).toBe(200);
    expect(list.headers.get("cache-control")).toBe("private, no-store");

    const detailHandlers = createAdminContentDetailHandlers(resolve);
    expect((await detailHandlers.GET(new Request("http://localhost/api/admin/content/problem/problem-a"), "problem", "problem-a")).status).toBe(200);
    expect((await detailHandlers.PATCH(new Request("http://localhost/api/admin/content/problem/problem-a", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deleted: true }),
    }), "problem", "problem-a")).status).toBe(200);

    const hidden = await createAdminContentHandlers(async () => null).GET(new Request("http://localhost/api/admin/content?type=problem"));
    expect(hidden.status).toBe(404);
  });
});
