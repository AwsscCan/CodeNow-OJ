import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/generate-tests/route";

afterEach(() => vi.unstubAllGlobals());

describe("POST /api/generate-tests", () => {
  it("returns complete tests and the quality report through the real route", async () => {
    const content = JSON.stringify({
      profile: {
        family: "math",
        inputShape: "two integers",
        acceptedComplexity: "O(1)",
        spaceComplexity: "O(1)",
        rejectedAlgorithms: [],
        coverageRisks: ["negative"],
        stressScale: 1,
      },
      tests: [
        { input: "0 0", output: "0", category: "boundary", scale: 1, targets: "zero boundary", reason: "minimum-like case" },
        { input: "2 3", output: "5", category: "special", scale: 1, targets: "basic arithmetic", reason: "simple exact result" },
        { input: "-5 8", output: "3", category: "ordinary", scale: 1, targets: "signed values", reason: "negative plus positive" },
      ],
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })));
    const request = new NextRequest("http://localhost/api/generate-tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: "test-key",
        endpoint: "https://api.deepseek.com",
        model: "deepseek-chat",
        count: 3,
        problem: { id: "A+B", title: "A+B", description: "Output a+b", inputFormat: "a b", outputFormat: "a+b", samples: [] },
      }),
    });

    const response = await POST(request);
    const body = await response.json() as { tests: Array<{ id: number; input: string; output: string }>; complexityReport: { qualityOk: boolean; generatedCount: number } };
    expect(response.status).toBe(200);
    expect(body.tests).toHaveLength(3);
    expect(body.tests.every((item) => Number.isFinite(item.id) && item.input && item.output)).toBe(true);
    expect(body.complexityReport).toMatchObject({ qualityOk: true, generatedCount: 3 });
  });

  it("rejects incomplete requests without calling an upstream model", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = new NextRequest("http://localhost/api/generate-tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "https://api.deepseek.com", model: "deepseek-chat", problem: {} }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
