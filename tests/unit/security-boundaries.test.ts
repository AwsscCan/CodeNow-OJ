import BetterSqlite3 from "better-sqlite3";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createConversationMessageHandlers } from "../../app/api/conversations/[id]/messages/route";
import { createConversationHandlers } from "../../app/api/conversations/route";
import { middleware } from "../../app/middleware";
import { createConversationRepository } from "../../app/server/conversations/conversation-repository";
import { createSecurityEvent, emitSecurityEvent } from "../../app/server/observability/events";
import { checkUserWriteQuota, cleanupExpiredRateLimits } from "../../app/server/security/auth-rate-limit";
import { authRateLimits, users } from "../../db/schema";
import * as schema from "../../db/schema";

describe("account security boundaries", () => {
  let sqlite: BetterSqlite3.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(() => {
    sqlite = new BetterSqlite3(":memory:");
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "drizzle" });
  });

  it("enforces isolated per-user write quotas and cleans expired counters", async () => {
    const input = { action: "conversation-write", pepper: "pepper", limit: 2, windowMs: 60_000 };
    expect((await checkUserWriteQuota(db, { ...input, userId: "user-a" })).allowed).toBe(true);
    expect((await checkUserWriteQuota(db, { ...input, userId: "user-a" })).allowed).toBe(true);
    expect((await checkUserWriteQuota(db, { ...input, userId: "user-a" })).allowed).toBe(false);
    expect((await checkUserWriteQuota(db, { ...input, userId: "user-b" })).allowed).toBe(true);
    expect(JSON.stringify(await db.select().from(authRateLimits))).not.toContain("user-a");

    sqlite.prepare("update auth_rate_limits set expires_at = ?").run(Date.now() - 1);
    expect(await cleanupExpiredRateLimits(db, new Date())).toBeGreaterThan(0);
    expect((await db.select({ value: count() }).from(authRateLimits))[0].value).toBe(0);
  });

  it("emits request events with opaque user hashes and recursive redaction", async () => {
    const sink = vi.fn();
    const event = await createSecurityEvent({
      requestId: "req-1", eventName: "preference.write", status: 409, durationMs: 12,
      userId: "user-a", pepper: "pepper",
      details: { email: "user@example.com", token: "raw-token", nested: { apiKey: "sk-secret" }, sourceCode: "private code", safeCount: 2 },
    });
    emitSecurityEvent(event, sink);
    const output = JSON.stringify(sink.mock.calls);
    expect(event).toMatchObject({ requestId: "req-1", eventName: "preference.write", status: 409, durationMs: 12, details: { safeCount: 2 } });
    expect(event.userHash).toMatch(/^[a-f0-9]{16}$/);
    expect(output).not.toMatch(/user-a|user@example\.com|raw-token|sk-secret|private code/);
  });

  it("sets request IDs and baseline browser security headers", async () => {
    const response = await middleware(new NextRequest("https://oj.example/library"));
    expect(response.headers.get("x-request-id")).toMatch(/^[A-Za-z0-9-]+$/);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain("object-src 'none'");
  });

  it("keeps Markdown and script-shaped messages inert JSON while blocking cross-user IDs", async () => {
    const now = new Date();
    await db.insert(users).values([
      { id: "user-a", name: "A", email: "a@example.com", emailVerified: true, createdAt: now, updatedAt: now },
      { id: "user-b", name: "B", email: "b@example.com", emailVerified: true, createdAt: now, updatedAt: now },
    ]);
    const repository = createConversationRepository(db);
    let userId = "user-a";
    const resolve = async () => ({ userId, repository });
    const created = await (await createConversationHandlers(resolve).POST(request("/api/conversations", "POST", { title: "安全测试" }))).json();
    const id = created.conversation.id as string;
    const content = "**bold** <script>globalThis.pwned=true</script>";
    const messages = createConversationMessageHandlers(resolve);
    const appended = await messages.POST(request(`/api/conversations/${id}/messages`, "POST", { expectedVersion: 1, role: "user", content }, "safe-message"), id);
    expect(appended.status).toBe(201);
    expect(appended.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await appended.json()).message.content).toBe(content);
    expect((globalThis as { pwned?: boolean }).pwned).toBeUndefined();

    userId = "user-b";
    expect((await messages.GET(request(`/api/conversations/${id}/messages`), id)).status).toBe(404);
    expect((await messages.POST(request(`/api/conversations/${id}/messages`, "POST", { expectedVersion: 2, role: "user", content: "swap" }, "swap"), id)).status).toBe(404);
    expect((await db.select().from(users).where(eq(users.id, "user-b"))).length).toBe(1);
  });

  function request(path: string, method = "GET", body?: unknown, key?: string) {
    return new Request(`http://localhost${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(key ? { "Idempotency-Key": key } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
});
