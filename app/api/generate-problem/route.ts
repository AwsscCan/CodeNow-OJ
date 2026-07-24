import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "../_lib/rate-limit";
import { generateComplexityAwareTests } from "../_lib/complexity-tests";
import { generateReferenceCandidate, validateReference, getCachedReference, setCachedReference } from "../_lib/reference-solution";
import { validateEndpoint } from "../_lib/validate-endpoint";
import { AI_MAX_RAW_PROBLEM_LENGTH, AI_TIMEOUT_MS } from "../_lib/constants";

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, "ai");
  if (!rl.allowed) return NextResponse.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 });

  try {
    let { apiKey, endpoint, model, rawProblem } = await request.json();
    apiKey = process.env.AI_API_KEY || apiKey;
    if (!apiKey) return NextResponse.json({ error: "未配置 AI API Key" }, { status: 400 });
    if (!endpoint || !model || !rawProblem) return NextResponse.json({ error: "AI 配置和题目原文不能为空" }, { status: 400 });
    if (typeof rawProblem !== "string" || rawProblem.trim().length < 20) return NextResponse.json({ error: "题目原文过短" }, { status: 400 });
    if (rawProblem.length > AI_MAX_RAW_PROBLEM_LENGTH) return NextResponse.json({ error: `题目原文不能超过 ${AI_MAX_RAW_PROBLEM_LENGTH} 个字符` }, { status: 400 });

    const chatUrl = validateEndpoint(String(endpoint));
    const isDeepSeek = /(^|\.)api\.deepseek\.com$/i.test(chatUrl.hostname);

    // Step 1: Structure the problem via AI
    const structContent = await structureProblem(chatUrl, String(apiKey), String(model), rawProblem, isDeepSeek);
    const cleaned = structContent.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("AI 未返回有效的题目 JSON");
    const problem = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(problem.samples) || problem.samples.length < 1) throw new Error("未能从题面提取样例");

    // Step 2: Build digest for reference solution generation
    const digest = buildDigest(problem);

    // Step 3: Try to get a validated reference solution (cached). This is
    // best-effort; imported free-form statements should still become usable
    // practice problems even when reference generation is unavailable.
    let validatedRef = getCachedReference(digest);
    if (!validatedRef) {
      try {
        const officialSamples = (problem.samples as Array<{ input: unknown; output: unknown }>).slice(0, 6)
          .map((s: { input: unknown; output: unknown }) => ({ input: String(s.input || ""), output: String(s.output || "") }));
        const candidate = await generateReferenceCandidate(String(apiKey), String(endpoint), String(model), digest, officialSamples);
        const { validated } = await validateReference(candidate, officialSamples, 0);
        if (validated) {
          validatedRef = validated;
          setCachedReference(digest, validatedRef);
        }
      } catch {
        /* Continue without a reference; test generation will require AI outputs. */
      }
    }

    // Step 4: Generate test inputs + compute outputs via reference
    problem.samples = (problem.samples as unknown[]).slice(0, 6);
    const generated = await generateComplexityAwareTests({
      apiKey: String(apiKey),
      endpoint: String(endpoint),
      model: String(model),
      problem,
      count: Math.max(6, 18 - (problem.samples as unknown[]).length),
      referenceSolution: validatedRef?.solutionCode,
      validatedRef,
    });

    problem.samples = [
      ...(problem.samples as Array<{ input: string; output: string }>),
      ...generated.tests,
    ].slice(0, 18).map((test: { input: string; output: string }, index: number) => ({
      id: index + 1, input: test.input, output: test.output,
    }));

    return NextResponse.json({
      problem,
      complexityReport: generated.report,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 题目生成失败";
    if (/timeout|timed out|abort/i.test(message) || (error instanceof Error && error.name === "TimeoutError")) {
      return NextResponse.json({ error: "AI 响应超时，请重试或改用 DeepSeek V4 Flash" }, { status: 504 });
    }
    if (/fetch failed|network|socket|connect/i.test(message)) {
      return NextResponse.json({ error: "暂时无法连接 AI 服务，请检查 API Endpoint 后重试" }, { status: 502 });
    }
    if (/不支持的 API/.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function structureProblem(chatUrl: URL, apiKey: string, model: string, rawProblem: string, isDeepSeek: boolean): Promise<string> {
  const body: Record<string, unknown> = {
    model, temperature: 0.1, max_tokens: 4000, stream: false,
    messages: [{
      role: "system",
      content: `解析OJ题目。只输出JSON：{"version":1,"id":"","title":"","difficulty":"入门","time":"1000 ms","memory":"128 MB","description":"","inputFormat":"","outputFormat":"","samples":[{"id":1,"input":"","output":""}]}。忠实提取题面样例，不编造。`,
    }, { role: "user", content: rawProblem }],
  };
  if (isDeepSeek) (body as Record<string, unknown>).thinking = { type: "disabled" };

  async function send(jsonMode: boolean) {
    if (jsonMode) (body.messages as unknown[])[0] = { ...(body.messages as unknown[])[0], response_format: { type: "json_object" } };
    return fetch(chatUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(AI_TIMEOUT_MS) });
  }

  let res = await send(true);
  if (!res.ok && (res.status === 400 || res.status === 422)) res = await send(false);
  const text = await res.text();
  let data: { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  try { data = JSON.parse(text); } catch { throw new Error(`AI 返回异常（HTTP ${res.status}）`); }
  if (!res.ok) throw new Error(data.error?.message || "上游 AI 请求失败");
  return data.choices?.[0]?.message?.content || "";
}

// Extract structured problem info without truncation
function extractProblemSpecification(rawText: string): string {
  // Return full text with key section markers — let AI parse it
  // If already structured, return as-is; otherwise wrap with hints
  if (rawText.includes("输入格式") || rawText.includes("输出格式")) return rawText;
  return `题目原文：
${rawText}

请从上述文本中准确提取：标题、描述、输入格式、输出格式、数据范围、样例。`;
}

function buildDigest(problem: Record<string, unknown>): string {
  return [
    `题号：${String(problem.id || "")}`,
    `标题：${String(problem.title || "")}`,
    `时限：${String(problem.time || "")} | 内存：${String(problem.memory || "")}`,
    `描述：${String(problem.description || "")}`,
    `输入格式：${String(problem.inputFormat || "")}`,
    `输出格式：${String(problem.outputFormat || "")}`,
  ].join("\n");
}
