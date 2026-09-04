import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createPreferenceHandlers } from "../../app/api/preferences/route";
import { createPreferenceRepository } from "../../app/server/preferences/preference-repository";
import { createLocalDb } from "../../db/client";
import { users } from "../../db/schema";

describe("safe preference API", () => {
  let db: ReturnType<typeof createLocalDb>;
  let repository: ReturnType<typeof createPreferenceRepository>;
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
    repository = createPreferenceRepository(db);
    userId = "user-a";
    resolve = async () => userId ? { userId, repository } : null;
  });

  it("returns 401 for anonymous reads and writes", async () => {
    userId = null;
    const handlers = createPreferenceHandlers(resolve);
    expect((await handlers.GET(request())).status).toBe(401);
    expect((await handlers.PATCH(request("PATCH", { version: 0, patch: { themeMode: "dark" } }))).status).toBe(401);
  });

  it("returns private no-store defaults before the first write", async () => {
    const response = await createPreferenceHandlers(resolve).GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ preferences: { themeMode: "light", editorTheme: "light", formatMode: "preserve" }, version: 0, updatedAt: null });
  });

  it("conditionally creates and updates isolated user preferences", async () => {
    const handlers = createPreferenceHandlers(resolve);
    const created = await handlers.PATCH(request("PATCH", { version: 0, patch: { themeMode: "dark", editorTheme: "girl" } }));
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ preferences: { themeMode: "dark", editorTheme: "girl" }, version: 1 });

    userId = "user-b";
    expect(await (await handlers.GET(request())).json()).toMatchObject({ preferences: { themeMode: "light", editorTheme: "light" }, version: 0 });
    await handlers.PATCH(request("PATCH", { version: 0, patch: { themeMode: "girl" } }));
    userId = "user-a";
    expect(await (await handlers.GET(request())).json()).toMatchObject({ preferences: { themeMode: "dark", editorTheme: "girl" }, version: 1 });
  });

  it("returns 409 with the current version for stale updates", async () => {
    const handlers = createPreferenceHandlers(resolve);
    await handlers.PATCH(request("PATCH", { version: 0, patch: { themeMode: "dark" } }));
    const stale = await handlers.PATCH(request("PATCH", { version: 0, patch: { themeMode: "girl" } }));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { code: "VERSION_CONFLICT", currentVersion: 1 } });
  });

  it("把格式化默认模式写入安全偏好并在读取时保留", async () => {
    const handlers = createPreferenceHandlers(resolve);
    const created = await handlers.PATCH(request("PATCH", { version: 0, patch: { formatMode: "full" } }));
    expect(created.status).toBe(200);
    expect((await created.json()).preferences).toMatchObject({ formatMode: "full" });
    expect(await (await handlers.GET(request())).json()).toMatchObject({ preferences: { formatMode: "full" } });
  });

  it.each([
    { version: 0, patch: { workspaceSplit: 42 } },
    { version: 0, patch: { apiKey: "sk-secret" } },
    { version: 0, patch: { nested: { apiKeys: ["secret"] } } },
    { version: 0, patch: { nested: { token: "secret" } } },
    { version: 0, patch: { nested: { secret: "secret" } } },
  ])("rejects unknown or sensitive fields: $patch", async (body) => {
    const response = await createPreferenceHandlers(resolve).PATCH(request("PATCH", body));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).not.toContain("sk-secret");
  });

  function request(method = "GET", body?: unknown) {
    return new Request("http://localhost/api/preferences", {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
});
