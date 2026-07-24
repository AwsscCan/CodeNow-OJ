import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "../_lib/rate-limit";
import { generateComplexityAwareTests } from "../_lib/complexity-tests";
import { generateReferenceCandidate, validateReference, getCachedReference, setCachedReference, type ValidatedReference } from "../_lib/reference-solution";

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, "ai");
  if (!rl.allowed) return NextResponse.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 });

  try {
    const { apiKey, endpoint, model, problem, count } = await request.json();
    const requested = Math.floor(Number(count));
    const target = Number.isFinite(requested) ? Math.max(1, Math.min(24, requested)) : 4;
    if (!apiKey || !endpoint || !model || !problem) {
      return NextResponse.json({ error: "AI 配置和题目信息不完整" }, { status: 400 });
    }

    const key = String(apiKey);
    const ep = String(endpoint);
    const md = String(model);

    // Build problem digest
    const digest = buildDigest(problem);

    // Get or create validated reference solution
    let validatedRef = getCachedReference(digest);
    if (!validatedRef) {
      const samples = Array.isArray(problem.samples) ? problem.samples.slice(0, 6).map((s: { input: unknown; output: unknown }) => ({ input: String(s.input || ""), output: String(s.output || "") })) : [];
      const candidate = await generateReferenceCandidate(key, ep, md, digest, samples);
      const { report, validated } = await validateReference(candidate, samples, 200);
      if (!validated) {
        return NextResponse.json({
          error: `参考程序验证失败: ${report.status}`,
          details: report.errors.slice(0, 5),
        }, { status: 422 });
      }
      validatedRef = validated;
      setCachedReference(digest, validatedRef);
    }

    // Generate tests using the validated reference to compute output
    const generated = await generateComplexityAwareTests({
      apiKey: key,
      endpoint: ep,
      model: md,
      problem,
      count: target,
      referenceSolution: validatedRef.solutionCode,
      validatedRef,
    });

    return NextResponse.json({
      tests: generated.tests.map((test, index) => ({ id: Date.now() + index, ...test })),
      complexityReport: generated.report,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 测试点生成失败";
    if (/timeout|timed out|abort/i.test(message) || (error instanceof Error && error.name === "TimeoutError")) {
      return NextResponse.json({ error: "AI 响应超时，请重试或减少测试点数量" }, { status: 504 });
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

function buildDigest(problem: Record<string, unknown>): string {
  const parts = [
    `题号：${String(problem.id || "")}`,
    `标题：${String(problem.title || "")}`,
    `时限：${String(problem.time || "")} | 内存：${String(problem.memory || "")}`,
    `描述：${String(problem.description || "")}`,
    `输入格式：${String(problem.inputFormat || "")}`,
    `输出格式：${String(problem.outputFormat || "")}`,
  ];
  return parts.join("\n");
}
