import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseGeneratedTests } from "../../app/api/_lib/complexity-tests";
import { buildCategoryQuota, generateComplexityAwareTests, __resetLanguageCacheForTests } from "../../app/api/_lib/test-generation-pipeline";

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
beforeEach(() => __resetLanguageCacheForTests());

// Fetch stub that models a real model: it obeys "generate exactly N" and fills
// by the requested category mix, so report.batches reflects the round-trip
// strategy (fewer requested-per-batch => more batches => slower + often short).
function obedientFetch() {
  let uid = 0;
  const makeCase = (category: string) => {
    const id = uid++;
    return test(`${id + 2}\n${id + 1}\n`, `${id + 1}\n`, category, category === "performance" ? 100000 : 1);
  };
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    if (String(url).includes("/languages")) {
      return new Response(JSON.stringify([{ id: 54, name: "C++ (GCC 9.2.0)" }]), { status: 200 });
    }
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
    const prompt = body.messages.map((m) => m.content).join("\n");
    const requested = Number(prompt.match(/generate exactly (\d+)/i)?.[1] || 4);
    const mix = JSON.parse(prompt.match(/Required remaining category mix: (\{[^}]*\})/)?.[1] || "{}") as Record<string, number>;
    const cases: ReturnType<typeof test>[] = [];
    let budget = requested;
    for (const [category, count] of Object.entries(mix)) {
      for (let k = 0; k < count && budget > 0; k++) { cases.push(makeCase(category)); budget -= 1; }
    }
    while (budget-- > 0) cases.push(makeCase("ordinary"));
    return aiResponse(cases);
  });
}

describe("test generation pipeline", () => {
  it("builds an exact quota whose sum matches every supported target", () => {
    for (let count = 1; count <= 50; count += 1) {
      const quota = buildCategoryQuota(count);
      expect(Object.values(quota).reduce((sum, value) => sum + value, 0)).toBe(count);
      expect(Object.values(quota).every((value) => value >= 0)).toBe(true);
    }
  });

  it("reaches a large target in very few AI round-trips", async () => {
    vi.stubGlobal("fetch", obedientFetch());
    const result = await generateComplexityAwareTests({
      apiKey: "test-key",
      endpoint: "https://api.deepseek.com",
      model: "deepseek-chat",
      problem,
      count: 18,
    });
    expect(result.tests).toHaveLength(18);
    expect(result.report.qualityOk).toBe(true);
    // A model that honors the requested batch size should satisfy an 18-case
    // quota in at most 2 round-trips (previously took ~4-5 because the first
    // batch only ever asked for 4 cases).
    expect(result.report.batches).toBeLessThanOrEqual(2);
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

  it("re-audits the oldest un-audited cases, not only the last three", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    const responses = [
      // First batch: five ordinary cases (C1..C5), no other categories yet.
      aiResponse([
        test("2\n1\n", "1\n", "ordinary"),
        test("2\n2\n", "2\n", "ordinary"),
        test("2\n3\n", "3\n", "ordinary"),
        test("2\n4\n", "4\n", "ordinary"),
        test("2\n5\n", "5\n", "ordinary"),
      ]),
      // Second batch fills the remaining categories.
      aiResponse([
        test("1\n0\n", "0\n", "boundary"),
        test("2\n7 7\n", "14\n", "special"),
        test("3\n9 -9 5\n", "5\n", "adversarial"),
        test("6\n1 1 1 1 1 1\n", "6\n", "performance", 100000),
      ]),
    ];
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return responses.shift()!;
    }));

    await generateComplexityAwareTests({
      apiKey: "test-key", endpoint: "https://api.deepseek.com", model: "deepseek-chat", problem, count: 8,
    });

    // The second batch prompt must re-audit the OLDEST cases (C1), which the old
    // last-3 window (C3,C4,C5) would have excluded.
    const secondPrompt = (requestBodies[1].messages as Array<{ content: string }>).map((m) => m.content).join("\n");
    expect(secondPrompt).toContain("\"caseId\":\"C1\"");
    expect(secondPrompt).toContain("\"caseId\":\"C2\"");
  });

  it("verifies reference outputs concurrently, not one at a time", async () => {
    judge0SubmitMock.mockReset();
    let inFlight = 0;
    let maxInFlight = 0;
    judge0SubmitMock.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 15));
      inFlight -= 1;
      return { accepted: true, stdout: "OK\n", stderr: "", compileError: "", statusId: 3, time: 5 };
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      if (String(url).includes("/languages")) return new Response(JSON.stringify([{ id: 54, name: "C++ (GCC 9.2.0)" }]), { status: 200 });
      return aiResponse([
        test("1\n0\n", "0\n", "boundary"),
        test("2\n7 7\n", "14\n", "special"),
        test("3\n1 2 3\n", "6\n", "ordinary"),
        test("4\n1 2 3 4\n", "10\n", "ordinary"),
        test("5\n5 4 3 2 1\n", "15\n", "adversarial"),
        test("6\n1 1 1 1 1 1\n", "6\n", "performance", 100000),
      ]);
    }));

    const validatedRef = {
      solutionCode: "int main(){return 0;}", bruteCode: "int main(){return 0;}",
      algorithmSummary: "sum", expectedTimeComplexity: "O(n)", expectedSpaceComplexity: "O(1)", bruteMaxScale: 10,
      report: { status: "validated" as const, compiled: true, samplesPassed: true, differentialTestsPassed: 8, differentialTestsFailed: 0, errors: [] },
    };

    const result = await generateComplexityAwareTests({
      apiKey: "test-key", endpoint: "https://api.deepseek.com", model: "deepseek-chat", problem, count: 6, validatedRef,
    });

    expect(result.tests).toHaveLength(6);
    // Sequential verification pins maxInFlight to 1; concurrent verification lifts it.
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it("does not claim validated_reference when the compiler is unreachable", async () => {
    judge0SubmitMock.mockReset();
    const aiResponses = [
      aiResponse([
        test("1\n0\n", "0\n", "boundary"),
        test("2\n7 7\n", "14\n", "special"),
        test("3\n1 2 3\n", "6\n", "ordinary"),
        test("4\n1 -1 2 100\n", "102\n", "adversarial"),
        test("6\n1 1 1 1 1 1\n", "6\n", "performance", 100000),
      ]),
    ];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      if (String(url).includes("/languages")) return new Response("upstream down", { status: 503 });
      return aiResponses.shift()!;
    }));

    const validatedRef = {
      solutionCode: "int main(){return 0;}", bruteCode: "int main(){return 0;}",
      algorithmSummary: "sum", expectedTimeComplexity: "O(n)", expectedSpaceComplexity: "O(1)", bruteMaxScale: 10,
      report: { status: "validated" as const, compiled: true, samplesPassed: true, differentialTestsPassed: 8, differentialTestsFailed: 0, errors: [] },
    };

    const result = await generateComplexityAwareTests({
      apiKey: "test-key", endpoint: "https://api.deepseek.com", model: "deepseek-chat", problem, count: 5, validatedRef,
    });

    // Nothing was actually run through the reference program.
    expect(result.report.computedCount).toBe(0);
    expect(result.report.referenceValidated).toBe(false);
    // The load-bearing signals must be honest: not reference-verified, not high quality.
    expect(result.report.verificationMode).not.toBe("validated_reference");
    expect(result.report.qualityOk).toBe(false);
  });

  it("fills output-bearing cases when the compiler is unreachable instead of truncating", async () => {
    judge0SubmitMock.mockReset();
    const aiResponses = [
      aiResponse([
        // quota-priority categories are draft (no output); only ordinary carries outputs
        test("1\n0\n", "", "boundary"),
        test("2\n7 7\n", "", "special"),
        test("9\n1 2 3\n", "", "adversarial"),
        test("3\n1 2 3\n", "6\n", "ordinary"),
        test("4\n1 2 3 4\n", "10\n", "ordinary"),
        test("5\n1 1 1 1 1\n", "5\n", "ordinary"),
        test("2\n9 -3\n", "6\n", "ordinary"),
      ]),
    ];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      if (String(url).includes("/languages")) return new Response("down", { status: 500 });
      return aiResponses.shift()!;
    }));

    const validatedRef = {
      solutionCode: "int main(){return 0;}", bruteCode: "int main(){return 0;}",
      algorithmSummary: "sum", expectedTimeComplexity: "O(n)", expectedSpaceComplexity: "O(1)", bruteMaxScale: 10,
      report: { status: "validated" as const, compiled: true, samplesPassed: true, differentialTestsPassed: 8, differentialTestsFailed: 0, errors: [] },
    };

    const result = await generateComplexityAwareTests({
      apiKey: "test-key", endpoint: "https://api.deepseek.com", model: "deepseek-chat", problem, count: 4, validatedRef,
    });

    // All four output-bearing ordinary cases should be kept, not truncated to 1.
    expect(result.tests).toHaveLength(4);
    expect(result.tests.every((item) => item.output.trim())).toBe(true);
  });

  it("prioritizes the still-missing category during reference backfill", async () => {
    judge0SubmitMock.mockReset();
    judge0SubmitMock.mockImplementation(async (_src: string, input: string) => (
      input.includes("BAD")
        ? { accepted: false, stdout: "", stderr: "re", compileError: "", statusId: 11, time: 5 }
        : { accepted: true, stdout: "OK\n", stderr: "", compileError: "", statusId: 3, time: 5 }
    ));
    const aiResponses = [
      // adversarial is rejected (BAD) so first pass leaves the adversarial quota short
      aiResponse([
        test("1\n0\n", "0\n", "boundary"),
        test("2\n7 7\n", "14\n", "special"),
        test("3\n1 2 3\n", "6\n", "ordinary"),
        test("9\nBAD\n", "0\n", "adversarial"),
      ]),
      // backfill returns a valid ORDINARY before the valid ADVERSARIAL — order must not matter
      aiResponse([
        test("4\n1 2 3 4\n", "10\n", "ordinary"),
        test("5\n1 -1 2 -2 100\n", "100\n", "adversarial"),
      ]),
    ];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      if (String(url).includes("/languages")) return new Response(JSON.stringify([{ id: 54, name: "C++ (GCC 9.2.0)" }]), { status: 200 });
      return aiResponses.shift()!;
    }));

    const validatedRef = {
      solutionCode: "int main(){return 0;}", bruteCode: "int main(){return 0;}",
      algorithmSummary: "sum", expectedTimeComplexity: "O(n)", expectedSpaceComplexity: "O(1)", bruteMaxScale: 10,
      report: { status: "validated" as const, compiled: true, samplesPassed: true, differentialTestsPassed: 8, differentialTestsFailed: 0, errors: [] },
    };

    const result = await generateComplexityAwareTests({
      apiKey: "test-key", endpoint: "https://api.deepseek.com", model: "deepseek-chat", problem, count: 4, validatedRef,
    });

    expect(result.tests).toHaveLength(4);
    expect(result.report.categoryCounts).toMatchObject({ adversarial: 1 });
    expect(result.report.unmetQuota.adversarial).toBe(0);
    expect(result.report.qualityOk).toBe(true);
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
