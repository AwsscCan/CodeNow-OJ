// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { requestMascotLine } from "../../app/lib/mascot-line-api";
import { MASCOT_LINE_POOL } from "../../app/stores/mascot-lines";

const baseReq = {
  phase: "wa" as const,
  context: { problemTitle: "A+B", codeExcerpt: "int main(){}", passed: 1, total: 3, firstFailedIndex: 1 },
  recentLines: [] as string[],
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("requestMascotLine", () => {
  it("未配置 API Key 时不发请求，直接用本地台词池", async () => {
    const line = await requestMascotLine({ ...baseReq, ai: { apiKey: "  ", endpoint: "e", model: "m" } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(MASCOT_LINE_POOL.wa.some((l) => l.text === line.text)).toBe(true);
  });

  it("成功时返回 AI 台词与表情", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ line: "又栽了吧，ふふ", mood: "annoyed", sprite: 4 }), { status: 200 }));
    const line = await requestMascotLine({ ...baseReq, ai: { apiKey: "sk-x", endpoint: "https://api.deepseek.com", model: "m" } });
    expect(line.text).toBe("又栽了吧，ふふ");
    expect(line.mood).toBe("annoyed");
    expect(line.sprite).toBe(4);
  });

  it("请求携带 phase / 上下文 / recentLines", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ line: "x", mood: "smug", sprite: 2 }), { status: 200 }));
    await requestMascotLine({ ...baseReq, recentLines: ["旧台词"], ai: { apiKey: "sk-x", endpoint: "https://api.deepseek.com", model: "m" } });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { event: { phase: string; problemTitle: string }; recentLines: string[] };
    expect(sent.event.phase).toBe("wa");
    expect(sent.event.problemTitle).toBe("A+B");
    expect(sent.recentLines).toContain("旧台词");
  });

  it("上游非 2xx 时降级到本地台词池", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "boom" }), { status: 500 }));
    const line = await requestMascotLine({ ...baseReq, ai: { apiKey: "sk-x", endpoint: "https://api.deepseek.com", model: "m" } });
    expect(MASCOT_LINE_POOL.wa.some((l) => l.text === line.text)).toBe(true);
  });

  it("网络异常时降级到本地台词池", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network"));
    const line = await requestMascotLine({ ...baseReq, ai: { apiKey: "sk-x", endpoint: "https://api.deepseek.com", model: "m" } });
    expect(MASCOT_LINE_POOL.wa.some((l) => l.text === line.text)).toBe(true);
  });

  it("AI 返回非法表情/越界精灵时回退本地表情，仍采用 AI 文案", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ line: "台词有效", mood: "不存在的表情", sprite: 99 }), { status: 200 }));
    const line = await requestMascotLine({ ...baseReq, ai: { apiKey: "sk-x", endpoint: "https://api.deepseek.com", model: "m" } });
    expect(line.text).toBe("台词有效");
    expect(["smile", "laugh", "smug", "surprised", "gentle", "annoyed", "angry"]).toContain(line.mood);
    expect(line.sprite).toBeGreaterThanOrEqual(0);
    expect(line.sprite).toBeLessThanOrEqual(6);
  });
});
