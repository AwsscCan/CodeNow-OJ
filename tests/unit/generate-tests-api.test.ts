import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GeneratedTest } from "../../app/api/_lib/complexity-tests";
import type { ValidatedReference } from "../../app/api/_lib/reference-solution";
import type { GenerationReport } from "../../app/api/_lib/test-generation-pipeline";
import { createGenerateTestsHandler, POST, type GenerateTestsHandlerDependencies } from "../../app/api/generate-tests/route";

type ResolveReference = NonNullable<GenerateTestsHandlerDependencies["resolveReference"]>;
type GenerateTests = NonNullable<GenerateTestsHandlerDependencies["generateTests"]>;
type GenerateResult = Awaited<ReturnType<GenerateTests>>;

function validatedReference(): ValidatedReference {
  return {
    solutionCode: "ref",
    bruteCode: "brute",
    algorithmSummary: "sum",
    expectedTimeComplexity: "O(n)",
    expectedSpaceComplexity: "O(1)",
    bruteMaxScale: 10,
    mutants: [],
    report: {
      status: "validated",
      compiled: true,
      samplesPassed: true,
      differentialTestsPassed: 4,
      differentialTestsFailed: 0,
      errors: [],
    },
  };
}

const generatedTest: GeneratedTest = {
  input: "1",
  output: "1",
  category: "ordinary",
  scale: 1,
  targets: "",
  reason: "",
};

const baseReport: GenerationReport = {
  expectedTimeComplexity: "O(n)",
  expectedSpaceComplexity: "O(1)",
  stressScale: 1,
  performanceCount: 0,
  adversarialCount: 0,
  requestedCount: 1,
  generatedCount: 1,
  partial: false,
  computedCount: 0,
  referenceValidated: false,
  draftOutputCount: 0,
  categoryQuota: { boundary: 0, special: 0, ordinary: 1, adversarial: 0, performance: 0 },
  categoryCounts: { ordinary: 1 },
  unmetQuota: { boundary: 0, special: 0, ordinary: 0, adversarial: 0, performance: 0 },
  qualityOk: true,
  verificationMode: "ai_structured",
  auditedCount: 0,
  batches: 1,
  elapsedMs: 0,
  profile: {
    family: "other",
    inputShape: "",
    acceptedComplexity: "O(n)",
    spaceComplexity: "O(1)",
    rejectedAlgorithms: [],
    coverageRisks: [],
    stressScale: 1,
  },
  warnings: [],
};

function generatedResult(report: Partial<GenerationReport> = {}): GenerateResult {
  return { tests: [generatedTest], report: { ...baseReport, ...report } };
}

afterEach(() => vi.unstubAllGlobals());

describe("POST /api/generate-tests", () => {
  it("passes the client cancellation signal into feedback reference resolution", async () => {
    let resolverSignal: AbortSignal | undefined;
    const resolveReference: ResolveReference = vi.fn(async (options) => {
      resolverSignal = options.signal;
      return { status: { ok: false, cached: false, message: "unavailable" } };
    });
    const generateTests: GenerateTests = vi.fn(async () => generatedResult());
    const handler = createGenerateTestsHandler({ resolveReference, generateTests });
    const request = new NextRequest("http://localhost/api/generate-tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "key", endpoint: "https://example.com", model: "model", qualityMode: "feedback", count: 1, problem: { id: "P", title: "P", description: "desc", samples: [] } }),
    });
    const requestSignal = request.signal;

    const response = await handler(request);

    expect(response.status).toBe(200);
    expect(resolverSignal).toBe(requestSignal);
  });

  it("passes the client cancellation signal into generation", async () => {
    let generationSignal: AbortSignal | undefined;
    const generateTests: GenerateTests = vi.fn(async (options) => {
      generationSignal = options.signal as AbortSignal | undefined;
      return generatedResult();
    });
    const handler = createGenerateTestsHandler({ generateTests });
    const request = new NextRequest("http://localhost/api/generate-tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "key", endpoint: "https://example.com", model: "model", count: 1, problem: { id: "P", title: "P", description: "desc", samples: [] } }),
    });
    const requestSignal = request.signal;

    const response = await handler(request);

    expect(response.status).toBe(200);
    expect(generationSignal).toBe(requestSignal);
  });

  it("maps a client AbortError to the established timeout response", async () => {
    const generateTests = vi.fn(async () => {
      throw new DOMException("client disconnected", "AbortError");
    });
    const handler = createGenerateTestsHandler({ generateTests });
    const response = await handler(new NextRequest("http://localhost/api/generate-tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "key", endpoint: "https://example.com", model: "model", count: 1, problem: { id: "P", title: "P", description: "desc", samples: [] } }),
    }));

    expect(response.status).toBe(504);
  });

  it("does not return generated tests after the client aborts during generation", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("client disconnected", "AbortError");
    let finishGeneration!: (result: Awaited<ReturnType<GenerateTests>>) => void;
    const generateTests: GenerateTests = vi.fn(() => new Promise<GenerateResult>((resolve) => {
      finishGeneration = resolve;
    }));
    const handler = createGenerateTestsHandler({ generateTests });
    const request = new NextRequest("http://localhost/api/generate-tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ apiKey: "key", endpoint: "https://example.com", model: "model", count: 1, problem: { id: "P", title: "P", description: "desc", samples: [] } }),
    });

    const responsePromise = handler(request);
    await vi.waitFor(() => expect(generateTests).toHaveBeenCalledOnce());
    controller.abort(abortError);
    finishGeneration(generatedResult());

    expect((await responsePromise).status).toBe(504);
  });

  it("passes a resolved validated reference into feedback-mode generation", async () => {
    const reference = validatedReference();
    const resolveReference: ResolveReference = vi.fn(async () => ({
      validatedRef: reference,
      status: { ok: true, cached: false, message: "created" },
    }));
    const generateTests: GenerateTests = vi.fn(async (options) => generatedResult({
      referenceValidated: Boolean(options.validatedRef),
    }));
    const handler = createGenerateTestsHandler({ resolveReference, generateTests });
    const request = new NextRequest("http://localhost/api/generate-tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: "test-key", endpoint: "https://api.deepseek.com", model: "deepseek-chat", qualityMode: "feedback", count: 1,
        problem: { id: "A+B", title: "A+B", description: "Output a+b", inputFormat: "a b", outputFormat: "a+b", samples: [] },
      }),
    });

    const response = await handler(request);
    const body = await response.json() as { complexityReport: { referenceStatus: { ok: boolean }; referenceValidated: boolean } };

    expect(resolveReference).toHaveBeenCalledOnce();
    expect(generateTests).toHaveBeenCalledWith(expect.objectContaining({ validatedRef: reference, referenceSolution: "ref" }));
    expect(body.complexityReport).toMatchObject({ referenceStatus: { ok: true }, referenceValidated: true });
  });

  it("falls back to ordinary generation when reference resolution fails", async () => {
    const resolveReference: ResolveReference = vi.fn(async () => ({
      status: { ok: false, cached: false, message: "compiler unavailable" },
    }));
    const generateTests: GenerateTests = vi.fn(async (options) => generatedResult({
      referenceValidated: Boolean(options.validatedRef),
    }));
    const handler = createGenerateTestsHandler({ resolveReference, generateTests });
    const request = new NextRequest("http://localhost/api/generate-tests", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "key", endpoint: "https://example.com", model: "model", qualityMode: "feedback", count: 1, problem: { id: "P", title: "P", description: "desc", samples: [] } }),
    });

    const response = await handler(request);
    const body = await response.json() as { complexityReport: { referenceStatus: { ok: boolean; message: string } } };

    expect(response.status).toBe(200);
    expect(generateTests).toHaveBeenCalledWith(expect.objectContaining({ validatedRef: undefined, referenceSolution: undefined }));
    expect(body.complexityReport.referenceStatus).toMatchObject({ ok: false, message: "compiler unavailable" });
  });

  it("does not resolve a reference in fast mode", async () => {
    const resolveReference = vi.fn();
    const generateTests: GenerateTests = vi.fn(async () => generatedResult());
    const handler = createGenerateTestsHandler({ resolveReference, generateTests });
    const request = new NextRequest("http://localhost/api/generate-tests", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "key", endpoint: "https://example.com", model: "model", count: 1, problem: { id: "P", title: "P", description: "desc", samples: [] } }),
    });

    await handler(request);

    expect(resolveReference).not.toHaveBeenCalled();
  });

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

  it("returns the actionable upstream error instead of a false zero-result explanation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: { message: "unsupported parameter: response_format" },
    }), { status: 400, headers: { "Content-Type": "application/json" } })));
    const request = new NextRequest("http://localhost/api/generate-tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: "test-key",
        endpoint: "https://api.deepseek.com",
        model: "deepseek-v4-flash",
        count: 18,
        problem: { id: "A+B", title: "A+B", description: "Output a+b", inputFormat: "a b", outputFormat: "a+b", samples: [] },
      }),
    });

    const response = await POST(request);
    const body = await response.json() as { error?: string };

    expect(response.status).toBe(500);
    expect(body.error).toContain("unsupported parameter: response_format");
    expect(body.error).not.toContain("只生成了 0/18");
  });

  it("redacts credentials echoed by an upstream error", async () => {
    const apiKey = "sk-super-secret-12345";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: { message: `invalid key ${apiKey}; Authorization: Bearer echoed-secret-token` },
    }), { status: 401, headers: { "Content-Type": "application/json" } })));
    const request = new NextRequest("http://localhost/api/generate-tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        endpoint: "https://example.com/v1",
        model: "compatible-model",
        count: 1,
        problem: { id: "A+B", title: "A+B", description: "Output a+b", inputFormat: "a b", outputFormat: "a+b", samples: [] },
      }),
    });

    const response = await POST(request);
    const body = await response.json() as { error?: string };

    expect(body.error).toContain("invalid key");
    expect(body.error).not.toContain(apiKey);
    expect(body.error).not.toContain("echoed-secret-token");
  });

  it("repairs missing outputs through the real route", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) {
        const content = JSON.stringify({ tests: [{ input: "2 3", output: "", category: "ordinary", scale: 1 }] });
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
      }
      const requestBody = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const prompt = requestBody.messages.map((message) => message.content).join("\n");
      const cases = JSON.parse(prompt.match(/Cases: (\[[\s\S]*\])$/)?.[1] || "[]") as Array<{ caseId: string; inputFingerprint: string }>;
      const content = JSON.stringify({ outputs: cases.map((item) => ({ ...item, output: "5" })) });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    }));
    const request = new NextRequest("http://localhost/api/generate-tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: "test-key",
        endpoint: "https://api.deepseek.com",
        model: "deepseek-v4-flash",
        count: 1,
        problem: { id: "A+B", title: "A+B", description: "Output a+b", inputFormat: "a b", outputFormat: "a+b", samples: [] },
      }),
    });

    const response = await POST(request);
    const body = await response.json() as { tests?: Array<{ input: string; output: string }> };

    expect(response.status).toBe(200);
    expect(body.tests).toMatchObject([{ input: "2 3\n", output: "5\n" }]);
    expect(calls).toBe(2);
  });
});
