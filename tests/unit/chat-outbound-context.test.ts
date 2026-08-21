import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/chat/route";
import { OUTBOUND_PROBLEM_CONTEXT_LIMITS } from "../../app/lib/outbound-problem-context";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("AI_API_KEY", "");
  fetchMock = vi.fn(async () => new Response(
    JSON.stringify({ choices: [{ message: { content: "Answer" } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  ));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/chat outbound sample provenance", () => {
  it("keeps Takagi companionship while sending a bounded JSON problem snapshot", async () => {
    const overflow = "__CHAT_DESCRIPTION_OVERFLOW__";
    const request = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: "sk-test",
        endpoint: "https://api.deepseek.com",
        model: "deepseek-chat",
        persona: "takagi",
        problem: {
          id: "P1001",
          title: "A+B\n__CHAT_TITLE_LINE_BREAK__",
          description: `Add two values${"x".repeat(OUTBOUND_PROBLEM_CONTEXT_LIMITS.description)}${overflow}`,
          inputFormat: "a b",
          outputFormat: "sum",
          samples: [{ input: "1 2", output: "3" }],
        },
        code: "int main() {}",
        messages: [{ role: "user", content: "How should I solve this?" }],
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const upstream = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const system = upstream.messages.find((message: { role: string }) => message.role === "system").content as string;
    expect(system).toContain("高木同学");
    expect(system).toContain('"title":"A+B\\n__CHAT_TITLE_LINE_BREAK__"');
    expect(system).toContain('"samples":[{"input":"1 2","output":"3"}]');
    expect(system).not.toContain(overflow);
  });

  it("keeps the source readable while continuing to remove C0 and DEL from memory context", async () => {
    const source = readFileSync(resolve(process.cwd(), "app/api/chat/route.ts"), "utf8");
    expect(source).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/);

    const request = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: "sk-test",
        endpoint: "https://api.deepseek.com",
        model: "deepseek-chat",
        problem: { id: "P1001", title: "A+B", description: "Add", inputFormat: "a b", outputFormat: "sum", samples: [] },
        code: "int main() {}",
        messages: [{ role: "user", content: "How should I solve this?" }],
        memories: ["first\u0000second\u001fthird\u007f"],
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const upstream = JSON.stringify(JSON.parse(fetchMock.mock.calls[0][1].body as string));
    expect(upstream).toContain("first second third");
    expect(upstream).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/);
  });

  it("does not send private samples or raw judge outputs to the external AI", async () => {
    const request = new NextRequest("http://localhost/api/chat", {
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
            { input: "__CHAT_PRIVATE_SAMPLE_SENTINEL__", output: "__CHAT_PRIVATE_OUTPUT_SENTINEL__", origin: "private" },
          ],
        },
        code: "int main() {}",
        messages: [{ role: "user", content: "How should I solve this?" }],
        judge: {
          lastRun: {
            passed: 0,
            total: 1,
            firstFailed: {
              index: 0,
              status: "WA",
              expected: "__CHAT_JUDGE_EXPECTED_SENTINEL__",
              actual: "__CHAT_JUDGE_ACTUAL_SENTINEL__",
            },
          },
        },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const upstream = JSON.stringify(JSON.parse(fetchMock.mock.calls[0][1].body as string));
    expect(upstream).toContain("1 2");
    expect(upstream).not.toContain("__CHAT_PRIVATE_SAMPLE_SENTINEL__");
    expect(upstream).not.toContain("__CHAT_JUDGE_EXPECTED_SENTINEL__");
    expect(upstream).not.toContain("__CHAT_JUDGE_ACTUAL_SENTINEL__");
  });

  it("does not forward unrecognized judge metadata as provider context", async () => {
    const request = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: "sk-test",
        endpoint: "https://api.deepseek.com",
        model: "deepseek-chat",
        problem: { id: "P1001", title: "A+B", description: "Add", inputFormat: "a b", outputFormat: "sum", samples: [] },
        code: "int main() {}",
        messages: [{ role: "user", content: "How should I solve this?" }],
        judge: {
          lastRun: {
            passed: 0,
            total: 1,
            firstFailed: { index: 0, status: "S3CRET1" },
          },
          history: [{
            at: "S3HISTAT",
            status: "S3HISTSTATUS",
            passed: "S3HISTPASS",
          }],
        },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const upstream = JSON.stringify(JSON.parse(fetchMock.mock.calls[0][1].body as string));
    expect(upstream).not.toContain("S3CRET1");
    expect(upstream).not.toContain("S3HISTAT");
    expect(upstream).not.toContain("S3HISTSTATUS");
    expect(upstream).not.toContain("S3HISTPASS");
  });
});
