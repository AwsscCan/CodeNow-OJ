import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAiHandler } from "../../app/api/ai/route";
import { OUTBOUND_PROBLEM_CONTEXT_LIMITS } from "../../app/lib/outbound-problem-context";
import { TEST_AI_CONFIG, resolveTestAiConfig } from "./ai-runtime-fixture";

const POST = createAiHandler(resolveTestAiConfig);

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("AI_API_KEY", "");
  fetchMock = vi.fn(async () => new Response(
    JSON.stringify({ choices: [{ message: { content: "int main() {}" } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  ));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/ai outbound sample provenance", () => {
  it("uses the Responses protocol selected by the account setting", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: "int main(){return 0;}" }] }] }), { status: 200 }));
    const handler = createAiHandler(async () => ({ ok: true, config: { ...TEST_AI_CONFIG, wireApi: "responses" } }));
    const response = await handler(new NextRequest("http://localhost/api/ai", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "revise", code: "int main(){}", problem: { id: "P1", title: "T", description: "D", inputFormat: "", outputFormat: "", samples: [] } }),
    }));
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://example.com/v1/responses");
    expect(requestBody).toMatchObject({ model: "test-model", max_output_tokens: expect.any(Number), input: expect.any(Array) });
    expect(requestBody.messages).toBeUndefined();
    expect(await response.json()).toEqual({ code: "int main(){return 0;}" });
  });

  it("sends existing code in revise mode and asks the model to preserve it", async () => {
    const request = new NextRequest("http://localhost/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "revise", code: "int main(){ return 0; }",
        problem: { id: "P1001", title: "A+B", description: "Add", inputFormat: "a b", outputFormat: "sum", samples: [] },
      }),
    });
    await expect(POST(request)).resolves.toHaveProperty("status", 200);
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.messages[0].content).toMatch(/保留原有正确逻辑/);
    expect(payload.messages[1].content).toContain("int main(){ return 0; }");
  });

  it("sends a bounded JSON problem snapshot instead of interpolated problem fields", async () => {
    const overflow = "__AI_DESCRIPTION_OVERFLOW__";
    const request = new NextRequest("http://localhost/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: "sk-test",
        endpoint: "https://api.deepseek.com",
        model: "deepseek-chat",
        problem: {
          id: "P1001",
          title: "A+B\n__AI_TITLE_LINE_BREAK__",
          description: `Add two values${"x".repeat(OUTBOUND_PROBLEM_CONTEXT_LIMITS.description)}${overflow}`,
          inputFormat: "a b",
          outputFormat: "sum",
          samples: [{ input: "1 2", output: "3" }],
        },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body as string).messages[1].content as string;
    expect(prompt).toContain('"title":"A+B\\n__AI_TITLE_LINE_BREAK__"');
    expect(prompt).toContain('"samples":[{"input":"1 2","output":"3"}]');
    expect(prompt).not.toContain(overflow);
  });

  it("does not send a private sample sentinel to the external AI", async () => {
    const request = new NextRequest("http://localhost/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: "sk-test",
        endpoint: "https://api.deepseek.com",
        model: "deepseek-chat",
        problem: {
          id: "P1001",
          title: "A+B",
          description: "Add two values",
          inputFormat: "a b",
          outputFormat: "sum",
          samples: [
            { input: "1 2", output: "3" },
            { input: "__AI_PRIVATE_SAMPLE_SENTINEL__", output: "__AI_PRIVATE_OUTPUT_SENTINEL__", origin: "private" },
          ],
        },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const upstream = JSON.stringify(JSON.parse(fetchMock.mock.calls[0][1].body as string));
    expect(upstream).toContain("1 2");
    expect(upstream).not.toContain("__AI_PRIVATE_SAMPLE_SENTINEL__");
  });
});
