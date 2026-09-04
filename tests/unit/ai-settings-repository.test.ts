import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createAiSettingsRepository } from "../../app/server/ai/ai-settings-repository";
import { createLocalDb } from "../../db/client";
import { aiSettings, problems, userPreferences, users } from "../../db/schema";

describe("account-scoped AI settings", () => {
  let db: ReturnType<typeof createLocalDb>;
  let repository: ReturnType<typeof createAiSettingsRepository>;

  beforeEach(async () => {
    db = createLocalDb(":memory:");
    migrate(db, { migrationsFolder: "drizzle" });
    const now = new Date();
    await db.insert(users).values([
      { id: "user-a", name: "A", email: "a@example.com", emailVerified: true, createdAt: now, updatedAt: now },
      { id: "user-b", name: "B", email: "b@example.com", emailVerified: true, createdAt: now, updatedAt: now },
    ]);
    repository = createAiSettingsRepository(db, { secret: "test-encryption-secret" });
  });

  it("encrypts the API key at rest and never returns it from public reads", async () => {
    const saved = await repository.save("user-a", {
      provider: "deepseek", endpoint: "https://api.deepseek.com", model: "deepseek-chat", apiKey: "sk-account-secret",
    }, 0);

    expect(saved.ok).toBe(true);
    expect(JSON.stringify(saved)).not.toContain("sk-account-secret");
    const [stored] = await db.select().from(aiSettings);
    expect(stored.apiKeyCiphertext).not.toContain("sk-account-secret");
    expect(await repository.get("user-a")).toMatchObject({ provider: "deepseek", model: "deepseek-chat", hasApiKey: true, version: 1 });
    expect(JSON.stringify(await repository.get("user-a"))).not.toContain("sk-account-secret");
    expect(await repository.resolve("user-a")).toMatchObject({ apiKey: "sk-account-secret", endpoint: "https://api.deepseek.com", model: "deepseek-chat" });
  });

  it("isolates settings by account and rejects stale writes", async () => {
    await repository.save("user-a", { provider: "openai", endpoint: "https://api.openai.com/v1", model: "gpt-4.1-mini", apiKey: "key-a" }, 0);
    expect(await repository.get("user-b")).toMatchObject({ configured: false, version: 0 });
    const stale = await repository.save("user-a", { provider: "openai", endpoint: "https://api.openai.com/v1", model: "gpt-4.1", apiKey: "key-b" }, 0);
    expect(stale).toMatchObject({ ok: false, status: 409, code: "VERSION_CONFLICT", currentVersion: 1 });
    expect((await repository.resolve("user-a"))?.apiKey).toBe("key-a");
  });

  it("updates metadata without replacing an existing key when apiKey is omitted", async () => {
    await repository.save("user-a", { provider: "custom", endpoint: "https://llm.example.com/v1", model: "model-a", apiKey: "keep-me" }, 0);
    await repository.save("user-a", { provider: "custom", endpoint: "https://llm.example.com/v1", model: "model-b" }, 1);
    expect(await repository.resolve("user-a")).toMatchObject({ model: "model-b", apiKey: "keep-me" });
  });

  it("persists the CCSwitch wire protocol without changing existing account data", async () => {
    await repository.save("user-a", { provider: "ccswitch", endpoint: "https://relay.example/v1", model: "gpt-5.5", apiKey: "keep-me", source: "ccswitch", wireApi: "responses" }, 0);
    expect(await repository.get("user-a")).toMatchObject({ provider: "ccswitch", wireApi: "responses", hasApiKey: true });
    expect(await repository.resolve("user-a")).toMatchObject({ endpoint: "https://relay.example/v1", model: "gpt-5.5", apiKey: "keep-me", wireApi: "responses" });
  });

  it("leaves existing preference and problem data untouched", async () => {
    const now = new Date();
    await db.insert(userPreferences).values({ userId: "user-a", themeMode: "girl", editorTheme: "dark", settingsJson: "{\"kept\":true}", version: 7, createdAt: now, updatedAt: now });
    await db.insert(problems).values({
      id: "problem-a", userId: "user-a", folderId: null, problemCode: "OLD1", title: "Existing",
      difficulty: "入门", timeLimit: "1000 ms", memoryLimit: "128 MB", description: "keep", inputFormat: "", outputFormat: "",
      origin: "private", version: 3, createdAt: now, updatedAt: now,
    });

    await repository.save("user-a", { provider: "deepseek", endpoint: "https://api.deepseek.com", model: "deepseek-chat", apiKey: "new-secret" }, 0);

    expect(await db.select().from(userPreferences)).toMatchObject([{ settingsJson: "{\"kept\":true}", version: 7 }]);
    expect(await db.select().from(problems)).toMatchObject([{ id: "problem-a", problemCode: "OLD1", title: "Existing", description: "keep", version: 3 }]);
  });
});
