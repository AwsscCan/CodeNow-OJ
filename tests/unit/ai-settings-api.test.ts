import { describe, expect, it, vi } from "vitest";
import { createAiSettingsHandlers } from "../../app/api/ai-settings/route";

const publicSettings = {
  configured: true, provider: "custom", endpoint: "https://llm.example.com/v1", model: "model-a",
  source: "manual", hasApiKey: true, version: 2, updatedAt: "2026-09-03T00:00:00.000Z",
};

describe("AI settings API", () => {
  it("requires authentication and returns private no-store responses", async () => {
    const handlers = createAiSettingsHandlers(async () => null);
    expect((await handlers.GET(request())).status).toBe(401);
    expect((await handlers.PUT(request("PUT", {}))).status).toBe(401);
  });

  it("never includes decrypted credentials in GET or PUT responses", async () => {
    const repository = {
      get: vi.fn(async () => publicSettings),
      save: vi.fn(async () => ({ ok: true as const, value: { ...publicSettings, version: 3 } })),
    };
    const handlers = createAiSettingsHandlers(async () => ({ userId: "user-a", repository: repository as never }));
    const get = await handlers.GET(request());
    const put = await handlers.PUT(request("PUT", { version: 2, provider: "custom", endpoint: "https://llm.example.com/v1", model: "model-a", apiKey: "sk-new-secret" }));

    expect(get.headers.get("Cache-Control")).toBe("private, no-store");
    expect(JSON.stringify(await get.json())).not.toContain("secret");
    expect(JSON.stringify(await put.json())).not.toContain("sk-new-secret");
    expect(repository.save).toHaveBeenCalledWith("user-a", expect.objectContaining({ apiKey: "sk-new-secret" }), 2);
  });

  function request(method = "GET", body?: unknown) {
    return new Request("http://localhost/api/ai-settings", {
      method, headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
});
