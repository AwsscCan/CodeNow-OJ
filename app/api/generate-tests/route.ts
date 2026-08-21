import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "../_lib/rate-limit";
import { resolveValidatedReference } from "../_lib/reference-resolution";
import { generateComplexityAwareTests } from "../_lib/test-generation-pipeline";

type GenerateOptions = Parameters<typeof generateComplexityAwareTests>[0];
type GenerateResult = Awaited<ReturnType<typeof generateComplexityAwareTests>>;
type ResolveOptions = Parameters<typeof resolveValidatedReference>[0];
type ResolveResult = Awaited<ReturnType<typeof resolveValidatedReference>>;

export type GenerateTestsHandlerDependencies = {
  resolveReference?: (options: ResolveOptions) => Promise<ResolveResult>;
  generateTests?: (options: GenerateOptions) => Promise<GenerateResult>;
};

function abortReason(signal: AbortSignal): unknown {
  const reason = signal.reason;
  if (reason && typeof reason === "object" && "name" in reason && String((reason as { name?: unknown }).name) === "AbortError") {
    return reason;
  }
  return new DOMException("The operation was aborted.", "AbortError");
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortReason(signal);
}

export function createGenerateTestsHandler(dependencies: GenerateTestsHandlerDependencies = {}) {
  const resolveReference = dependencies.resolveReference || resolveValidatedReference;
  const generateTests = dependencies.generateTests || generateComplexityAwareTests;

  return async function handleGenerateTests(request: NextRequest) {
    const rl = rateLimit(request, "ai");
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests. Please retry later." }, { status: 429 });

    try {
      const requestData = await request.json() as Record<string, unknown>;
      const { apiKey, endpoint, model, problem, count } = requestData;
      const requested = Math.floor(Number(count));
      const target = Number.isFinite(requested) ? Math.max(1, Math.min(50, requested)) : 12;
      if (!apiKey || !endpoint || !model || !problem || typeof problem !== "object") {
        return NextResponse.json({ error: "AI configuration and problem data are required." }, { status: 400 });
      }

      const problemRecord = problem as Record<string, unknown>;
      const digest = buildDigest(problemRecord);
      const qualityMode = requestData.qualityMode === "feedback";
      let validatedRef: ResolveResult["validatedRef"];
      let referenceStatus: ResolveResult["status"] = {
        ok: false,
        cached: false,
        message: "Fast generation mode: AI generates input and output directly.",
      };
      if (qualityMode) {
        throwIfAborted(request.signal);
        const samples = Array.isArray(problemRecord.samples)
          ? problemRecord.samples.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const sample = item as Record<string, unknown>;
            const input = String(sample.input || "");
            const output = String(sample.output || "");
            return input.trim() ? [{ input, output }] : [];
          }).slice(0, 6)
          : [];
        const resolved = await resolveReference({
          apiKey: String(apiKey),
          endpoint: String(endpoint),
          model: String(model),
          problemDigest: digest,
          samples,
          signal: request.signal,
        });
        throwIfAborted(request.signal);
        validatedRef = resolved.validatedRef;
        referenceStatus = resolved.status;
      }

      const generated = await generateTests({
        apiKey: String(apiKey),
        endpoint: String(endpoint),
        model: String(model),
        problem: problemRecord,
        count: target,
        referenceSolution: validatedRef?.solutionCode,
        validatedRef,
        signal: request.signal,
      });
      throwIfAborted(request.signal);

      return NextResponse.json({
        tests: generated.tests.map((test, index) => ({ id: Date.now() + index, ...test })),
        complexityReport: { ...generated.report, referenceStatus },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI test generation failed.";
      const errorName = error && typeof error === "object" && "name" in error
        ? String((error as { name?: unknown }).name)
        : "";
      if (/timeout|timed out|abort/i.test(message) || errorName === "AbortError" || errorName === "TimeoutError") {
        return NextResponse.json({ error: "AI response timed out. Try fewer tests, a faster model, or retry later." }, { status: 504 });
      }
      if (/fetch failed|network|socket|connect/i.test(message)) {
        return NextResponse.json({ error: "Cannot connect to the AI service. Please check API Endpoint and Key." }, { status: 502 });
      }
      if (message.includes("API Endpoint")) return NextResponse.json({ error: message }, { status: 400 });
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}

export const POST = createGenerateTestsHandler();

function buildDigest(problem: Record<string, unknown>): string {
  return [
    `Problem ID: ${String(problem.id || "")}`,
    `Title: ${String(problem.title || "")}`,
    `Statement: ${String(problem.description || "")}`,
    `Input format: ${String(problem.inputFormat || "")}`,
    `Output format: ${String(problem.outputFormat || "")}`,
  ].join("\n");
}
