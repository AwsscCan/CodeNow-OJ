import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "../_lib/rate-limit";
import { generateComplexityAwareTests } from "../_lib/complexity-tests";

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
    const generated = await generateComplexityAwareTests({
      apiKey: String(apiKey),
      endpoint: String(endpoint),
      model: String(model),
      problem,
      count: target,
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
    return NextResponse.json({ error: message }, { status: /复杂度校验未通过|压力测试计划/.test(message) ? 422 : 500 });
  }
}
