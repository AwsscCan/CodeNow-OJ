import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "../_lib/rate-limit";
import { generateComplexityAwareTests } from "../_lib/test-generation-pipeline";
import { getCachedReference } from "../_lib/reference-solution";

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, "ai");
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests. Please retry later." }, { status: 429 });

  try {
    const { apiKey, endpoint, model, problem, count } = await request.json();
    const requested = Math.floor(Number(count));
    const target = Number.isFinite(requested) ? Math.max(1, Math.min(50, requested)) : 12;
    if (!apiKey || !endpoint || !model || !problem) {
      return NextResponse.json({ error: "AI configuration and problem data are required." }, { status: 400 });
    }

    const digest = buildDigest(problem);
    const validatedRef = getCachedReference(digest);
    const referenceStatus = validatedRef
      ? { ok: true, message: "Using cached validated reference solution." }
      : { ok: false, message: "Fast generation mode: AI generates input and output directly." };

    const generated = await generateComplexityAwareTests({
      apiKey: String(apiKey),
      endpoint: String(endpoint),
      model: String(model),
      problem,
      count: target,
      referenceSolution: validatedRef?.solutionCode,
      validatedRef: validatedRef || undefined,
    });

    return NextResponse.json({
      tests: generated.tests.map((test, index) => ({ id: Date.now() + index, ...test })),
      complexityReport: { ...generated.report, referenceStatus },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI test generation failed.";
    if (/timeout|timed out|abort/i.test(message) || (error instanceof Error && error.name === "TimeoutError")) {
      return NextResponse.json({ error: "AI response timed out. Try fewer tests, a faster model, or retry later." }, { status: 504 });
    }
    if (/fetch failed|network|socket|connect/i.test(message)) {
      return NextResponse.json({ error: "Cannot connect to the AI service. Please check API Endpoint and Key." }, { status: 502 });
    }
    if (message.includes("API Endpoint")) return NextResponse.json({ error: message }, { status: 400 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildDigest(problem: Record<string, unknown>): string {
  return [
    `Problem ID: ${String(problem.id || "")}`,
    `Title: ${String(problem.title || "")}`,
    `Limits: ${String(problem.time || "")} | ${String(problem.memory || "")}`,
    `Statement: ${String(problem.description || "")}`,
    `Input format: ${String(problem.inputFormat || "")}`,
    `Output format: ${String(problem.outputFormat || "")}`,
  ].join("\n");
}
