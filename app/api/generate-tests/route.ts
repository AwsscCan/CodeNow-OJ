import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "../_lib/rate-limit";
import { generateComplexityAwareTests } from "../_lib/complexity-tests";
import { generateReferenceCandidate, validateReference, getCachedReference, setCachedReference } from "../_lib/reference-solution";

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, "ai");
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests. Please retry later." }, { status: 429 });

  try {
    const { apiKey, endpoint, model, problem, count } = await request.json();
    const requested = Math.floor(Number(count));
    const target = Number.isFinite(requested) ? Math.max(1, Math.min(24, requested)) : 8;
    if (!apiKey || !endpoint || !model || !problem) {
      return NextResponse.json({ error: "AI configuration and problem data are required." }, { status: 400 });
    }

    const key = String(apiKey);
    const ep = String(endpoint);
    const md = String(model);
    const digest = buildDigest(problem);
    const samples = Array.isArray(problem.samples)
      ? problem.samples.slice(0, 6).map((s: { input: unknown; output: unknown }) => ({ input: String(s.input || ""), output: String(s.output || "") }))
      : [];

    let validatedRef = getCachedReference(digest);
    let referenceStatus: { ok: boolean; message: string } = validatedRef
      ? { ok: true, message: "Using cached validated reference solution." }
      : { ok: false, message: "No validated reference solution yet; AI outputs will be used directly." };

    if (!validatedRef) {
      try {
        const candidate = await generateReferenceCandidate(key, ep, md, digest, samples);
        // Differential fuzzing is intentionally skipped here. The previous 200-round
        // array-only random input check rejected many valid non-array problems and made
        // test generation unusable. Official samples + compilation are safer as a soft enhancement.
        const { report, validated } = await validateReference(candidate, samples, 0);
        if (validated) {
          validatedRef = validated;
          setCachedReference(digest, validatedRef);
          referenceStatus = { ok: true, message: "Validated reference solution is available and used to compute outputs." };
        } else {
          referenceStatus = { ok: false, message: `Reference validation failed; fell back to AI outputs: ${report.errors[0] || report.status}` };
        }
      } catch (refError) {
        const message = refError instanceof Error ? refError.message : "reference generation failed";
        referenceStatus = { ok: false, message: `Reference solution unavailable; fell back to AI outputs: ${message}` };
      }
    }

    const generated = await generateComplexityAwareTests({
      apiKey: key,
      endpoint: ep,
      model: md,
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
      return NextResponse.json({ error: "AI response timed out. Try a smaller batch, a faster model, or retry later." }, { status: 504 });
    }
    if (/fetch failed|network|socket|connect/i.test(message)) {
      return NextResponse.json({ error: "Cannot connect to the AI service. Please check API Endpoint and Key." }, { status: 502 });
    }
    if (message.includes("API Endpoint")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
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
