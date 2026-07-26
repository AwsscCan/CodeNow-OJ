import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/chat/route";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("AI_API_KEY", "");
  fetchMock = vi.fn(async () => new Response(
    JSON.stringify({ choices: [{ message: { content: "回答内容" } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  ));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function makeRequest(extra: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: "sk-test",
      endpoint: "https://api.deepseek.com",
      model: "deepseek-chat",
      problem: { id: "P1001", title: "A+B", description: "求和", inputFormat: "a b", outputFormat: "和", samples: [] },
      code: "int main(){}",
      messages: [{ role: "user", content: "这题怎么想？" }],
      ...extra,
    }),
  });
}

function sentSystemPrompt(): string {
  const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { messages: { role: string; content: string }[] };
  return body.messages.find((m) => m.role === "system")?.content ?? "";
}

describe("POST /api/chat 高木人设联动", () => {
  it("persona=takagi 时 system 提示词切换为高木同学人设并保留题目上下文", async () => {
    const res = await POST(makeRequest({ persona: "takagi" }));
    expect(res.status).toBe(200);
    const system = sentSystemPrompt();
    expect(system).toContain("高木同学");
    expect(system).toMatch(/勝負しよ|バレバレ|私の勝ち/);
    expect(system).toContain("P1001");
    expect(system).toContain("C++17");
  });

  it("未指定 persona 时保持原教练人设，不含高木", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const system = sentSystemPrompt();
    expect(system).toContain("教练");
    expect(system).not.toContain("高木");
  });

  it("persona=takagi 时注入原作台词参考(情境检索)", async () => {
    await POST(makeRequest({ persona: "takagi", messages: [{ role: "user", content: "要不要打个赌，这次我一遍过" }] }));
    const system = sentSystemPrompt();
    expect(system).toMatch(/类似场景/);
    expect(system).toMatch(/禁止照抄|不要照抄/);
    expect(system).toContain("「");
  });

  it("非 takagi 人设不注入原作台词", async () => {
    await POST(makeRequest({ messages: [{ role: "user", content: "要不要打个赌" }] }));
    expect(sentSystemPrompt()).not.toMatch(/类似场景说过/);
  });

  it("回归：缺少 API Key 返回 400 且不调上游", async () => {
    const res = await POST(makeRequest({ apiKey: undefined }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("用户记忆注入 system 提示词(长期观察段)", async () => {
    await POST(makeRequest({ persona: "takagi", memories: ["在「P1001」WA 过(1/3)，第 2 个点先挂", "常在边界情况上没把握"] }));
    const system = sentSystemPrompt();
    expect(system).toContain("长期观察");
    expect(system).toContain("WA 过(1/3)");
    expect(system).toContain("边界情况上没把握");
  });

  it("判题动态注入 system：最近一次运行与提交记录", async () => {
    await POST(makeRequest({
      judge: {
        lastRun: { passed: 1, total: 3, firstFailed: { index: 1, status: "WA", expected: "73", actual: "2" } },
        history: [{ at: "2026-07-26T12:00:00.000Z", status: "部分通过", passed: "1/3" }],
      },
    }));
    const system = sentSystemPrompt();
    expect(system).toContain("判题动态");
    expect(system).toContain("1/3");
    expect(system).toMatch(/第 2 个/);
    expect(system).toContain("部分通过");
  });

  it("上游返回 reasoning_content 时一并透出 reasoning", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: "答案内容", reasoning_content: "我先分析边界…" } }],
    }), { status: 200 }));
    const res = await POST(makeRequest({ persona: "takagi" }));
    const body = await res.json() as { answer?: string; reasoning?: string };
    expect(body.answer).toBe("答案内容");
    expect(body.reasoning).toBe("我先分析边界…");
  });

  it("记忆注入有截断保护：超量条目只保留最近 8 条且压平换行", async () => {
    const memories = Array.from({ length: 12 }, (_, i) => `记忆${i}号`);
    memories.push("异常\n换行注入");
    await POST(makeRequest({ memories }));
    const system = sentSystemPrompt();
    // 13 条只保留最近 8 条：前 5 条被裁掉
    expect(system).not.toContain("记忆4号");
    expect(system).toContain("记忆5号");
    expect(system).toContain("记忆11号");
    expect(system).not.toContain("异常\n换行注入");
    expect(system).toContain("异常 换行注入");
  });
});
