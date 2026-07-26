import { count } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createConversationMessageHandlers } from "../../app/api/conversations/[id]/messages/route";
import { createConversationHandlers } from "../../app/api/conversations/route";
import { createConversationRepository } from "../../app/server/conversations/conversation-repository";
import { createLocalDb } from "../../db/client";
import { aiMessages, users } from "../../db/schema";

describe("user-owned conversation APIs", () => {
  let db: ReturnType<typeof createLocalDb>;
  let repository: ReturnType<typeof createConversationRepository>;
  let userId: string | null;
  let resolve: () => Promise<{ userId: string; repository: typeof repository } | null>;

  beforeEach(async () => {
    db = createLocalDb(":memory:");
    migrate(db, { migrationsFolder: "drizzle" });
    const now = new Date();
    await db.insert(users).values([
      { id: "user-a", name: "A", email: "a@example.com", emailVerified: true, createdAt: now, updatedAt: now },
      { id: "user-b", name: "B", email: "b@example.com", emailVerified: true, createdAt: now, updatedAt: now },
    ]);
    repository = createConversationRepository(db);
    userId = "user-a";
    resolve = async () => userId ? { userId, repository } : null;
  });

  it("rejects anonymous access", async () => {
    userId = null;
    expect((await createConversationHandlers(resolve).GET(request("/api/conversations"))).status).toBe(401);
    expect((await createConversationHandlers(resolve).POST(request("/api/conversations", "POST", { title: "New" }))).status).toBe(401);
    expect((await createConversationMessageHandlers(resolve).GET(request("/api/conversations/x/messages"), "x")).status).toBe(401);
  });

  it("creates and paginates conversation metadata without embedding messages", async () => {
    const handlers = createConversationHandlers(resolve);
    for (const title of ["One", "Two", "Three"]) {
      expect((await handlers.POST(request("/api/conversations", "POST", { title, problemRef: "CF0001" }))).status).toBe(201);
    }
    const first = await (await handlers.GET(request("/api/conversations?limit=2"))).json();
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    expect(JSON.stringify(first)).not.toContain("messages");
    const second = await (await handlers.GET(request(`/api/conversations?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`))).json();
    expect(second.items).toHaveLength(1);
  });

  it("appends idempotent ordered messages and detects stale versions", async () => {
    const conversation = await createConversation("Chat");
    const messages = createConversationMessageHandlers(resolve);
    const firstRequest = appendRequest(conversation.id, { expectedVersion: 1, role: "user", content: "Question" }, "same-key");
    const first = await messages.POST(firstRequest, conversation.id);
    expect(first.status).toBe(201);
    const repeated = await messages.POST(appendRequest(conversation.id, { expectedVersion: 1, role: "user", content: "Question" }, "same-key"), conversation.id);
    expect(await repeated.json()).toEqual(await first.json());
    expect((await db.select({ value: count() }).from(aiMessages))[0].value).toBe(1);

    expect((await messages.POST(appendRequest(conversation.id, { expectedVersion: 1, role: "assistant", content: "Stale" }, "stale"), conversation.id)).status).toBe(409);
    expect((await messages.POST(appendRequest(conversation.id, { expectedVersion: 2, role: "assistant", content: "Answer" }, "answer"), conversation.id)).status).toBe(201);
    const firstPage = await (await messages.GET(request(`/api/conversations/${conversation.id}/messages?limit=1`), conversation.id)).json();
    expect(firstPage.items.map((item: { role: string; content: string; sortOrder: number }) => [item.role, item.content, item.sortOrder]))
      .toEqual([["user", "Question", 0]]);
    expect(firstPage.nextCursor).toBe(0);
    const secondPage = await (await messages.GET(request(`/api/conversations/${conversation.id}/messages?limit=1&cursor=0`), conversation.id)).json();
    expect(secondPage.items.map((item: { role: string; content: string; sortOrder: number }) => [item.role, item.content, item.sortOrder]))
      .toEqual([["assistant", "Answer", 1]]);
  });

  it("updates titles conditionally and deletes conversations with their messages", async () => {
    const conversation = await createConversation("Old title");
    const collection = createConversationHandlers(resolve);
    const updated = await collection.PATCH(request("/api/conversations", "PATCH", { id: conversation.id, version: 1, title: "New title" }));
    expect(await updated.json()).toMatchObject({ conversation: { title: "New title", version: 2 } });
    expect((await collection.PATCH(request("/api/conversations", "PATCH", { id: conversation.id, version: 1, title: "Stale" }))).status).toBe(409);
    await createConversationMessageHandlers(resolve).POST(appendRequest(conversation.id, { expectedVersion: 2, role: "user", content: "Delete me" }, "delete"), conversation.id);
    expect((await collection.DELETE(request(`/api/conversations?id=${conversation.id}`, "DELETE"))).status).toBe(200);
    expect((await db.select({ value: count() }).from(aiMessages))[0].value).toBe(0);
  });

  it("returns 404 for cross-user object identifiers", async () => {
    const conversation = await createConversation("Private");
    userId = "user-b";
    const messages = createConversationMessageHandlers(resolve);
    expect((await messages.GET(request(`/api/conversations/${conversation.id}/messages`), conversation.id)).status).toBe(404);
    expect((await messages.POST(appendRequest(conversation.id, { expectedVersion: 1, role: "user", content: "Attack" }, "attack"), conversation.id)).status).toBe(404);
    const collection = createConversationHandlers(resolve);
    expect((await collection.PATCH(request("/api/conversations", "PATCH", { id: conversation.id, version: 1, title: "Attack" }))).status).toBe(404);
    expect((await collection.DELETE(request(`/api/conversations?id=${conversation.id}`, "DELETE"))).status).toBe(404);
  });

  it("enforces body limits and rejects credential-shaped fields", async () => {
    const collection = createConversationHandlers(resolve);
    expect((await collection.POST(request("/api/conversations", "POST", { title: "x".repeat(201) }))).status).toBe(413);
    const conversation = await createConversation("Limits");
    const messages = createConversationMessageHandlers(resolve);
    expect((await messages.POST(request(`/api/conversations/${conversation.id}/messages`, "POST", { expectedVersion: 1, role: "user", content: "missing key" }), conversation.id)).status).toBe(400);
    expect((await messages.POST(appendRequest(conversation.id, { expectedVersion: 1, role: "user", content: "x".repeat(64 * 1024 + 1) }, "large"), conversation.id)).status).toBe(413);
    expect((await messages.POST(appendRequest(conversation.id, { expectedVersion: 1, role: "user", content: "ok", apiKey: "sk-secret" }, "secret"), conversation.id)).status).toBe(400);
    expect(JSON.stringify(await db.select().from(aiMessages))).not.toContain("sk-secret");
  });

  async function createConversation(title: string) {
    const response = await createConversationHandlers(resolve).POST(request("/api/conversations", "POST", { title }));
    return (await response.json()).conversation as { id: string; version: number };
  }

  function appendRequest(id: string, body: unknown, key: string) {
    return request(`/api/conversations/${id}/messages`, "POST", body, key);
  }

  function request(path: string, method = "GET", body?: unknown, key?: string) {
    return new Request(`http://localhost${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(key ? { "Idempotency-Key": key } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
});
