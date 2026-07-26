import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/generate-problem/route";

afterEach(() => vi.unstubAllGlobals());

const STRUCTURED_PROBLEM = JSON.stringify({
  version: 1, id: "MAXSUB", title: "最大子段和", difficulty: "普及",
  time: "1000 ms", memory: "128 MB",
  description: "给定整数序列，求最大连续子段和。",
  inputFormat: "第一行 n，第二行 n 个整数。", outputFormat: "一个整数。",
  samples: [{ id: 1, input: "5\n1 -2 3 4 -1", output: "7" }, { id: 2, input: "1\n-3", output: "-3" }],
});

const PIPELINE_TESTS = JSON.stringify({
  profile: {
    family: "dp", inputShape: "sequence", acceptedComplexity: "O(n)", spaceComplexity: "O(1)",
    rejectedAlgorithms: [], coverageRisks: ["all-negative"], stressScale: 1,
  },
  tests: [
    { input: "3\n-1 -2 -3", output: "-1", category: "boundary", scale: 1, targets: "all negative", reason: "negative-only sequence" },
    { input: "4\n2 2 2 2", output: "8", category: "ordinary", scale: 1, targets: "all positive", reason: "whole array is answer" },
  ],
});

function makeRequest(extra: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/generate-problem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: "test-key",
      endpoint: "https://api.deepseek.com",
      model: "deepseek-chat",
      rawProblem: "给定一个长度为 n 的整数序列，请你求出最大连续子段和。输入输出如题面描述。",
      ...extra,
    }),
  });
}

describe("POST /api/generate-problem 解析与测试点解耦", () => {
  it("默认只解析题面：保留官方样例，不追加批量测试点，也不多调上游", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ choices: [{ message: { content: STRUCTURED_PROBLEM } }] }), { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(makeRequest());
    const body = await response.json() as { problem: { samples: unknown[] } };
    expect(response.status).toBe(200);
    expect(body.problem.samples, "默认不应追加 AI 批量测试点").toHaveLength(2);
    expect(fetchMock, "默认只应调用一次上游(题面结构化)").toHaveBeenCalledTimes(1);
  });

  it("withTests=true 时才联动生成批量测试点", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ choices: [{ message: { content: fetchMock.mock.calls.length <= 1 ? STRUCTURED_PROBLEM : PIPELINE_TESTS } }] }), { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(makeRequest({ withTests: true }));
    const body = await response.json() as { problem: { samples: unknown[] } };
    expect(response.status).toBe(200);
    expect(body.problem.samples.length, "withTests 应追加批量测试点").toBeGreaterThan(2);
    expect(fetchMock.mock.calls.length, "withTests 应调用测试点生成上游").toBeGreaterThan(1);
  });

  it("缺参数直接 400，不调上游", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = new NextRequest("http://localhost/api/generate-problem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "https://api.deepseek.com", model: "deepseek-chat" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
