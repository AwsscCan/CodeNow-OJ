import { afterEach, describe, expect, it, vi } from "vitest";
import { parseGeneratedTests } from "../../app/api/_lib/complexity-tests";
import { buildCategoryQuota, generateComplexityAwareTests } from "../../app/api/_lib/test-generation-pipeline";

const judge0SubmitMock = vi.fn();
vi.mock("../../app/api/_lib/reference-solution", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../app/api/_lib/reference-solution")>();
  return { ...actual, judge0Submit: (...args: unknown[]) => judge0SubmitMock(...args) };
});

const problem = {
  id: "T1",
  title: "求和",
  time: "1000 ms",
  memory: "128 MB",
  description: "给定 n 个整数，输出它们的和。1 <= n <= 100000。",
  inputFormat: "第一行 n，第二行 n 个整数。",
  outputFormat: "一个整数，表示总和。",
  samples: [],
};

const profile = {
  family: "array",
  inputShape: "n then n integers",
  acceptedComplexity: "O(n)",
  spaceComplexity: "O(1)",
  rejectedAlgorithms: ["O(n^2)"],
  coverageRisks: ["overflow", "negative values"],
  stressScale: 100000,
};

function test(input: string, output: string, category: string, scale = 1) {
  const complexity = category === "performance" ? " and reject O(n^2) brute force" : "";
  return { input, output, category, scale, targets: `kill ${category} bug${complexity}`, reason: `covers ${category} behavior` };
}

function aiResponse(tests: ReturnType<typeof test>[], audits: Array<Record<string, unknown>> = []) {
  const content = JSON.stringify({ profile, audits, tests });
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("test generation pipeline", () => {
  it("builds an exact quota whose sum matches every supported target", () => {
    for (let count = 1; count <= 50; count += 1) {
      const quota = buildCategoryQuota(count);
      expect(Object.values(quota).reduce((sum, value) => sum + value, 0)).toBe(count);
      expect(Object.values(quota).every((value) => value >= 0)).toBe(true);
    }
  });

  it("continues from the first batch, fills the requested amount, and meets coverage quotas", async () => {
    const responses = [
      aiResponse([
        test("1\n0\n", "0\n", "boundary"),
        test("2\n7 7\n", "14\n", "special"),
        test("3\n1 2 3\n", "6\n", "ordinary"),
        test("3\n-1 4 8\n", "11\n", "ordinary"),
      ]),
      aiResponse([
        test("4\n1 1 1 1\n", "4\n", "ordinary"),
        test("4\n-5 2 2 2\n", "1\n", "ordinary"),
        test("5\n100 -100 2 -2 1\n", "1\n", "adversarial", 5),
        test("6\n1 2 3 4 5 6\n", "21\n", "performance", 100000),
        test("2\n9 -3\n", "6\n", "ordinary"),
      ], [{ caseId: "C1", valid: true }, { caseId: "C2", valid: true }]),
    ];
    const requestBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return responses.shift()!;
    }));

    const result = await generateComplexityAwareTests({
      apiKey: "test-key",
      endpoint: "https://api.deepseek.com",
      model: "deepseek-chat",
      problem,
      count: 8,
    });

    expect(result.tests).toHaveLength(8);
    expect(new Set(result.tests.map((item) => item.input.trim())).size).toBe(8);
    expect(result.report.qualityOk).toBe(true);
    expect(result.report).toMatchObject({ verificationMode: "ai_cross_batch", auditedCount: 2 });
    expect(result.report.categoryCounts).toMatchObject({ boundary: 1, special: 1, ordinary: 4, adversarial: 1, performance: 1 });
    expect(requestBodies).toHaveLength(2);
    const secondMessages = requestBodies[1].messages as Array<{ role: string; content: string }>;
    expect(secondMessages[0].role).toBe("assistant");
    expect(secondMessages[0].content).toContain("1\\n0");
    expect(secondMessages[1].content).toContain("Already accepted cases");
  });

  it("retries after an unusable response and excludes duplicate existing samples", async () => {
    const existingProblem = { ...problem, samples: [{ input: "1\n0\n", output: "0\n" }] };
    const responses = [
      new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }), { status: 200 }),
      aiResponse([
        test("1\n0\n", "0\n", "boundary"),
        test("1\n5\n", "5\n", "boundary"),
        test("2\n3 3\n", "6\n", "special"),
        test("3\n1 1 2\n", "4\n", "ordinary"),
      ]),
      aiResponse([
        test("4\n1 2 3 4\n", "10\n", "ordinary"),
        test("5\n1 -1 1 -1 0\n", "0\n", "adversarial"),
        test("6\n1 1 1 1 1 1\n", "6\n", "performance", 100000),
      ]),
    ];
    vi.stubGlobal("fetch", vi.fn(async () => responses.shift()!));

    const result = await generateComplexityAwareTests({
      apiKey: "test-key",
      endpoint: "https://api.openai.com/v1",
      model: "test-model",
      problem: existingProblem,
      count: 6,
    });

    expect(result.tests).toHaveLength(6);
    expect(result.tests.some((item) => item.input.trim() === "1\n0")).toBe(false);
    expect(result.report.batches).toBe(3);
    expect(result.report.warnings[0]).toContain("no new valid cases");
  });

  it("keeps supplementing category gaps even when the raw total already reached the target", async () => {
    const responses = [
      aiResponse([
        test("1\n1\n", "1\n", "ordinary"),
        test("1\n2\n", "2\n", "ordinary"),
        test("1\n3\n", "3\n", "ordinary"),
        test("1\n4\n", "4\n", "ordinary"),
        test("1\n5\n", "5\n", "ordinary"),
      ]),
      aiResponse([
        test("1\n0\n", "0\n", "boundary"),
        test("2\n7 7\n", "14\n", "special"),
        test("3\n100 -100 0\n", "0\n", "adversarial"),
        test("4\n1 2 3 4\n", "10\n", "performance", 100000),
      ]),
    ];
    const fetchMock = vi.fn(async () => responses.shift()!);
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateComplexityAwareTests({
      apiKey: "test-key",
      endpoint: "https://api.deepseek.com",
      model: "deepseek-chat",
      problem,
      count: 5,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.tests).toHaveLength(5);
    expect(result.report.qualityOk).toBe(true);
    expect(result.report.categoryCounts).toMatchObject({ boundary: 1, special: 1, ordinary: 1, adversarial: 1, performance: 1 });
  });

  it("treats internal-line trailing-whitespace variants as duplicate inputs", async () => {
    const responses = [
      aiResponse([
        test("1\n0\n", "0\n", "boundary"),
        test("2\n7 7\n", "14\n", "special"),
        test("3\n9 -9 5\n", "5\n", "adversarial"),
        test("6\n1 1 1 1 1 1\n", "6\n", "performance", 100000),
        test("2\n5 5\n", "10\n", "ordinary"),
        // identical test but with a trailing space on the first line — must be deduped
        test("2 \n5 5\n", "10\n", "ordinary"),
      ]),
      aiResponse([
        test("4\n1 2 3 4\n", "10\n", "ordinary"),
      ]),
    ];
    const fetchMock = vi.fn(async () => responses.shift()!);
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateComplexityAwareTests({
      apiKey: "test-key",
      endpoint: "https://api.deepseek.com",
      model: "deepseek-chat",
      problem,
      count: 6,
    });

    const canonical = (value: string) => value.replace(/[ \t]+$/gm, "").replace(/\n{2,}/g, "\n").trim();
    const canonicalInputs = result.tests.map((item) => canonical(item.input));
    expect(new Set(canonicalInputs).size).toBe(result.tests.length);
    expect(result.tests).toHaveLength(6);
    expect(result.report.categoryCounts).toMatchObject({ ordinary: 2 });
  });

  it("treats internal multi-space variants as duplicate inputs", async () => {
    const responses = [
      aiResponse([
        test("1\n0\n", "0\n", "boundary"),
        test("2\n7 7\n", "14\n", "special"),
        test("3\n9 -9 5\n", "5\n", "adversarial"),
        test("6\n1 1 1 1 1 1\n", "6\n", "performance", 100000),
        test("2\n5 5\n", "10\n", "ordinary"),
        // identical test but with a double space between the values — must be deduped
        test("2\n5  5\n", "10\n", "ordinary"),
      ]),
      aiResponse([
        test("4\n1 2 3 4\n", "10\n", "ordinary"),
      ]),
    ];
    const fetchMock = vi.fn(async () => responses.shift()!);
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateComplexityAwareTests({
      apiKey: "test-key",
      endpoint: "https://api.deepseek.com",
      model: "deepseek-chat",
      problem,
      count: 6,
    });

    const canonical = (value: string) => value.replace(/[ \t]+/g, " ").replace(/ *\n/g, "\n").trim();
    const canonicalInputs = result.tests.map((item) => canonical(item.input));
    expect(new Set(canonicalInputs).size).toBe(result.tests.length);
    expect(result.tests).toHaveLength(6);
    expect(result.report.categoryCounts).toMatchObject({ ordinary: 2 });
  });

  it("backfills after a validated reference rejects some generated inputs", async () => {
    judge0SubmitMock.mockReset();
    // The reference program accepts every input except the one flagged BAD.
    judge0SubmitMock.mockImplementation(async (_src: string, input: string) => (
      input.includes("BAD")
        ? { accepted: false, stdout: "", stderr: "runtime error", compileError: "", statusId: 11, time: 5 }
        : { accepted: true, stdout: "OK\n", stderr: "", compileError: "", statusId: 3, time: 5 }
    ));

    const aiResponses = [
      // First batch: the adversarial case has a malformed (BAD) input.
      aiResponse([
        test("1\n0\n", "0\n", "boundary"),
        test("2\n7 7\n", "14\n", "special"),
        test("3\n1 2 3\n", "6\n", "ordinary"),
        test("9\nBAD\n", "0\n", "adversarial"),
      ]),
      // Backfill batch: a valid adversarial replacement.
      aiResponse([
        test("5\n1 -1 2 -2 100\n", "100\n", "adversarial"),
      ]),
    ];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      if (String(url).includes("/languages")) {
        return new Response(JSON.stringify([{ id: 54, name: "C++ (GCC 9.2.0)" }]), { status: 200 });
      }
      return aiResponses.shift()!;
    }));

    const validatedRef = {
      solutionCode: "int main(){return 0;}",
      bruteCode: "int main(){return 0;}",
      algorithmSummary: "prefix sum",
      expectedTimeComplexity: "O(n)",
      expectedSpaceComplexity: "O(1)",
      bruteMaxScale: 10,
      report: {
        status: "validated" as const, compiled: true, samplesPassed: true,
        differentialTestsPassed: 8, differentialTestsFailed: 0, errors: [],
      },
    };

    const result = await generateComplexityAwareTests({
      apiKey: "test-key",
      endpoint: "https://api.deepseek.com",
      model: "deepseek-chat",
      problem,
      count: 4,
      validatedRef,
    });

    // The BAD input must be dropped, then backfilled to reach the exact target.
    expect(result.tests).toHaveLength(4);
    expect(result.tests.some((item) => item.input.includes("BAD"))).toBe(false);
    expect(result.tests.every((item) => item.output === "OK\n")).toBe(true);
    expect(result.report.computedCount).toBe(4);
    expect(result.report.referenceValidated).toBe(true);
    expect(result.report.categoryCounts).toMatchObject({ adversarial: 1 });
  });
});

describe("real model response parser", () => {
  it("repairs fenced JSON and trailing commas", () => {
    const parsed = parseGeneratedTests('```json\n{"tests":[{"input":"1\\n5\\n","output":"5\\n","category":"boundary",},]}\n```');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].input).toBe("1\n5\n");
  });

  it("expands lossless compressed input and output parts", () => {
    const parsed = parseGeneratedTests(JSON.stringify({
      tests: [{
        inputParts: [
          { type: "literal", value: "4\n" },
          { type: "range", start: 1, end: 4, step: 1, separator: " " },
          { type: "literal", value: "\n" },
        ],
        outputParts: [{ type: "literal", value: "10\n" }],
        category: "performance",
        scale: 4,
      }],
    }));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ input: "4\n1 2 3 4\n", output: "10\n" });
  });
});
