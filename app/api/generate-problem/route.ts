import { NextRequest, NextResponse } from "next/server";
import { AI_MAX_RAW_PROBLEM_LENGTH, AI_TIMEOUT_MS } from "../_lib/constants";
import { rateLimit } from "../_lib/rate-limit";
import { getCachedReference } from "../_lib/reference-solution";
import { generateComplexityAwareTests } from "../_lib/test-generation-pipeline";
import { validateEndpoint } from "../_lib/validate-endpoint";
import { resolveAiRuntime, type AiRuntimeResolution } from "../../server/ai/ai-runtime";
import type { AiWireApi } from "../../server/ai/ai-settings-repository";
import { redactSensitiveText } from "../../server/ai/redact";
import { buildWireBody, buildWireHeaders, extractWireText } from "../_lib/ai-wire";

type ResolveAiConfig = (request: Request) => Promise<AiRuntimeResolution>;

export function createGenerateProblemHandler(resolveConfig: ResolveAiConfig = resolveAiRuntime) {
  return async function handleGenerateProblem(request: NextRequest) {
  const rl = rateLimit(request, "ai");
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests. Please retry later." }, { status: 429 });

  try {
    const requestData = await request.json();
    const { rawProblem } = requestData;
    const resolved = await resolveConfig(request);
    if (!resolved.ok) return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    const { apiKey, endpoint, model, wireApi } = resolved.config;
    if (!rawProblem) return NextResponse.json({ error: "Raw problem text is required." }, { status: 400 });
    if (typeof rawProblem !== "string" || rawProblem.trim().length < 20) return NextResponse.json({ error: "Problem text is too short." }, { status: 400 });
    if (rawProblem.length > AI_MAX_RAW_PROBLEM_LENGTH) return NextResponse.json({ error: `Problem text cannot exceed ${AI_MAX_RAW_PROBLEM_LENGTH} characters.` }, { status: 400 });

    const chatUrl = validateEndpoint(String(endpoint), wireApi);
    const isDeepSeek = /(^|\.)api\.deepseek\.com$/i.test(chatUrl.hostname);
    const structContent = await structureProblem(chatUrl, String(apiKey), String(model), rawProblem, wireApi, isDeepSeek);
    const cleaned = structContent.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("AI did not return valid problem JSON.");
    const problem = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(problem.samples)) problem.samples = [];

    const digest = buildDigest(problem);
    const validatedRef = getCachedReference(digest);
    const referenceStatus = validatedRef
      ? { ok: true, message: "Using cached validated reference solution." }
      : { ok: false, message: "Fast generation mode: AI generates input and output directly." };

    problem.samples = (problem.samples as unknown[]).slice(0, 6);

    // 默认只解析题面与官方样例快速入库；测试点批量生成耗时且易超时，仅在显式要求时联动
    if (requestData.withTests !== true) {
      problem.samples = (problem.samples as Array<{ input: string; output: string }>).map((test, index) => ({
        id: index + 1, input: test.input, output: test.output,
      }));
      return NextResponse.json({
        problem,
        complexityReport: { generatedCount: 0, requestedCount: 0, batches: 0, qualityOk: true, skippedTests: true, referenceStatus },
      });
    }
    const generated = await generateComplexityAwareTests({
      apiKey: String(apiKey),
      endpoint: String(endpoint),
      model: String(model),
      problem,
      count: Math.max(12, 30 - (problem.samples as unknown[]).length),
      referenceSolution: validatedRef?.solutionCode,
      validatedRef: validatedRef || undefined,
      wireApi,
    });

    problem.samples = [
      ...(problem.samples as Array<{ input: string; output: string }>),
      ...generated.tests,
    ].slice(0, 30).map((test: { input: string; output: string }, index: number) => ({
      id: index + 1,
      input: test.input,
      output: test.output,
      category: (test as { category?: string }).category,
      scale: (test as { scale?: number }).scale,
      targets: (test as { targets?: string }).targets,
      reason: (test as { reason?: string }).reason,
    }));

    return NextResponse.json({ problem, complexityReport: { ...generated.report, referenceStatus } });
  } catch (error) {
    const message = redactSensitiveText(error instanceof Error ? error : "AI problem generation failed.", []);
    if (/timeout|timed out|abort/i.test(message) || (error instanceof Error && error.name === "TimeoutError")) {
      return NextResponse.json({ error: "AI response timed out. Try smaller batches, DeepSeek V4 Flash, or retry later." }, { status: 504 });
    }
    if (/fetch failed|network|socket|connect/i.test(message)) {
      return NextResponse.json({ error: "Cannot connect to the AI service. Please check API Endpoint and Key." }, { status: 502 });
    }
    if (message.includes("API Endpoint")) return NextResponse.json({ error: message }, { status: 400 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
  };
}

export const POST = createGenerateProblemHandler();

async function structureProblem(chatUrl: URL, apiKey: string, model: string, rawProblem: string, wireApi: AiWireApi, isDeepSeek: boolean): Promise<string> {
  const messages = [{
      role: "system" as const,
      content: [
        "Parse an online-judge programming problem. Return ONLY one valid JSON object.",
        `Schema: {"version":1,"id":"","title":"","difficulty":"beginner","time":"1000 ms","memory":"128 MB","description":"","inputFormat":"","outputFormat":"","samples":[{"id":1,"input":"","output":""}]}`,
        "Extract official samples if present. If samples are missing, return an empty samples array; do not invent official samples.",
        "Preserve input/output line breaks exactly.",
      ].join("\n"),
    }, { role: "user" as const, content: rawProblem }];
  const body: Record<string, unknown> = buildWireBody({ wireApi, model, temperature: 0.1, maxTokens: 4000, messages });
  if (wireApi === "chat_completions") {
    body.stream = false;
    body.response_format = { type: "json_object" };
    if (isDeepSeek) body.thinking = { type: "disabled" };
  }

  async function send(jsonMode: boolean) {
    const requestBody = jsonMode ? body : { ...body };
    if (!jsonMode) delete (requestBody as Record<string, unknown>).response_format;
    return fetch(chatUrl, {
      method: "POST",
      headers: buildWireHeaders(apiKey, wireApi),
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  }

  let res = await send(true);
  if (!res.ok && (res.status === 400 || res.status === 422)) res = await send(false);
  const text = await res.text();
  let data: { choices?: { message?: { content?: string } }[]; content?: Array<{ type?: string; text?: string }>; output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; error?: { message?: string } };
  try { data = JSON.parse(text); } catch { throw new Error(`AI returned invalid HTTP response (${res.status}).`); }
  if (!res.ok) throw new Error(data.error?.message || "Upstream AI request failed.");
  return extractWireText(data);
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
