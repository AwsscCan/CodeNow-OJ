import { afterEach, describe, expect, it, vi } from "vitest";
import { saveRecord } from "../../app/hooks/use-judge";

afterEach(() => vi.unstubAllGlobals());

describe("submission client", () => {
  it("keeps an anonymous submission locally and omits server-owned fields", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(body).not.toHaveProperty("id");
      expect(body).not.toHaveProperty("submittedAt");
      expect(body).not.toHaveProperty("userId");
      expect(body.results).toMatchObject([{ status: "AC", duration: 14 }]);
      expect(body.totalDurationMs).toBe(14);
      return Response.json({ error: { code: "AUTH_REQUIRED", message: "请先登录" } }, { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const local = await saveRecord({
      id: "local-id",
      problemId: "P1",
      problemTitle: "A+B",
      status: "答案正确",
      passed: "1/1",
      sourceCode: "int main(){}",
      results: [{ id: 1, status: "AC", actual: "3", expected: "3", duration: 14 }],
      totalDurationMs: 14,
      submittedAt: new Date().toISOString(),
    });

    expect(local).toMatchObject({ id: "local-id", localOnly: true });
  });
});
