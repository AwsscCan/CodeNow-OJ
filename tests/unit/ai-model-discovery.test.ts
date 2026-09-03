import { describe, expect, it, vi } from "vitest";
import { discoverAiModels } from "../../app/server/ai/model-discovery";

describe("AI model discovery", () => {
  it("loads OpenAI-compatible /models and returns unique model ids", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "model-b" }, { id: "model-a" }, { id: "model-a" }] }), { status: 200 }));
    const result = await discoverAiModels({ endpoint: "https://llm.example.com/v1", apiKey: "sk-secret", configuredModel: "model-current" }, fetcher);

    expect(result.models).toEqual(["model-current", "model-a", "model-b"]);
    expect(fetcher).toHaveBeenCalledWith(new URL("https://llm.example.com/v1/models"), expect.objectContaining({ headers: { Authorization: "Bearer sk-secret" } }));
    expect(JSON.stringify(result)).not.toContain("sk-secret");
  });

  it.each(["http://localhost:11434/v1", "https://127.0.0.1/v1", "https://user:pass@example.com/v1"])("rejects unsafe discovery endpoint %s", async (endpoint) => {
    const fetcher = vi.fn();
    await expect(discoverAiModels({ endpoint, apiKey: "secret", configuredModel: "" }, fetcher)).rejects.toThrow(/Endpoint|安全|HTTPS/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("redacts credentials from upstream errors", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { message: "bad key sk-secret" } }), { status: 401 }));
    await expect(discoverAiModels({ endpoint: "https://llm.example.com/v1", apiKey: "sk-secret", configuredModel: "" }, fetcher)).rejects.not.toThrow("sk-secret");
  });
});
