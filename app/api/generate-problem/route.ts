import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "../_lib/rate-limit";
import { generateComplexityAwareTests } from "../_lib/complexity-tests";
import { generateReferenceCandidate, validateReference, getCachedReference, setCachedReference } from "../_lib/reference-solution";
import { validateEndpoint } from "../_lib/validate-endpoint";
import { AI_MAX_RAW_PROBLEM_LENGTH, AI_TIMEOUT_MS } from "../_lib/constants";

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, "ai");
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests. Please retry later." }, { status: 429 });

  try {
    let { apiKey, endpoint, model, rawProblem } = await request.json();
    apiKey = process.env.AI_API_KEY || apiKey;
    if (!apiKey) return NextResponse.json({ error: "AI API Key is not configured." }, { status: 400 });
    if (!endpoint || !model || !rawProblem) return NextResponse.json({ error: "AI configuration and raw problem text are required." }, { status: 400 });
    if (typeof rawProblem !== "string" || rawProblem.trim().length < 20) return NextResponse.json({ error: "Problem text is too short." }, { status: 400 });
    if (rawProblem.length > AI_MAX_RAW_PROBLEM_LENGTH) return NextResponse.json({ error: `Problem text cannot exceed ${AI_MAX_RAW_PROBLEM_LENGTH} characters.` }, { status: 400 });

    const chatUrl = validateEndpoint(String(endpoint));
    const isDeepSeek = /(^|\.)api\.deepseek\.com$/i.test(chatUrl.hostname);

    const structContent = await structureProblem(chatUrl, String(apiKey), String(model), rawProblem, isDeepSeek);
    const cleaned = structContent.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("AI did not return valid problem JSON.");
    const problem = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(problem.samples) || problem.samples.length < 1) throw new Error("Could not extract official samples from the statement.");

    const digest = buildDigest(problem);
    const officialSamples = (problem.samples as Array<{ input: unknown; output: unknown }>).slice(0, 6)
      .map((s: { input: unknown; output: unknown }) => ({ input: String(s.input || ""), output: String(s.output || "") }));

    let validatedRef = getCachedReference(digest);
    let referenceStatus: { ok: boolean; message: string } = validatedRef
      ? { ok: true, message: "Using cached validated reference solution." }
      : { ok: false, message: "No validated reference solution yet; AI outputs will be used directly." };

    if (!validatedRef) {
      try {
        const candidate = await generateReferenceCandidate(String(apiKey), String(endpoint), String(model), digest, officialSamples);
        const { report, validated } = await validateReference(candidate, officialSamples, 0);
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

    problem.samples = (problem.samples as unknown[]).slice(0, 6);
    const generated = await generateComplexityAwareTests({
      apiKey: String(apiKey),
      endpoint: String(endpoint),
      model: String(model),
      problem,
      count: Math.max(6, 18 - (problem.samples as unknown[]).length),
      referenceSolution: validatedRef?.solutionCode,
      validatedRef: validatedRef || undefined,
    });

    problem.samples = [
      ...(problem.samples as Array<{ input: string; output: string }>),
      ...generated.tests,
    ].slice(0, 18).map((test: { input: string; output: string }, index: number) => ({
      id: index + 1, input: test.input, output: test.output,
    }));

    return NextResponse.json({
      problem,
      complexityReport: { ...generated.report, referenceStatus },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI problem generation failed.";
    if (/timeout|timed out|abort/i.test(message) || (error instanceof Error && error.name === "TimeoutError")) {
      return NextResponse.json({ error: "AI response timed out. Try a smaller batch, DeepSeek V4 Flash, or retry later." }, { status: 504 });
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

async function structureProblem(chatUrl: URL, apiKey: string, model: string, rawProblem: string, isDeepSeek: boolean): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    temperature: 0.1,
    max_tokens: 4000,
    stream: false,
    response_format: { type: "json_object" },
    messages: [{
      role: "system",
      content: [
        "Parse an online-judge programming problem. Return ONLY one valid JSON object.",
        `Schema: {"version":1,"id":"","title":"","difficulty":"beginner","time":"1000 ms","memory":"128 MB","description":"","inputFormat":"","outputFormat":"","samples":[{"id":1,"input":"","output":""}]}`,
        "Extract official samples faithfully. Do not invent samples. Preserve input/output line breaks exactly.",
      ].join("\n"),
    }, { role: "user", content: rawProblem }],
  };
  if (isDeepSeek) body.thinking = { type: "disabled" };

  async function send(jsonMode: boolean) {
    const requestBody = jsonMode ? body : { ...body };
    if (!jsonMode) delete (requestBody as Record<string, unknown>).response_format;
    return fetch(chatUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  }

  let res = await send(true);
  if (!res.ok && (res.status === 400 || res.status === 422)) res = await send(false);
  const text = await res.text();
  let data: { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  try { data = JSON.parse(text); } catch { throw new Error(`AI returned invalid HTTP response (${res.status}).`); }
  if (!res.ok) throw new Error(data.error?.message || "Upstream AI request failed.");
  return data.choices?.[0]?.message?.content || "";
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
