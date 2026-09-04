import { NextRequest, NextResponse } from "next/server";
import { buildOutboundProblemContext, serializeOutboundProblemContext } from "../../lib/outbound-problem-context";
import { AI_DEFAULT_TEMPERATURE, AI_MAX_TOKENS_SOLUTION } from "../_lib/constants";
import { rateLimit } from "../_lib/rate-limit";
import { validateEndpoint } from "../_lib/validate-endpoint";
import { resolveAiRuntime, type AiRuntimeResolution } from "../../server/ai/ai-runtime";
import { redactSensitiveText } from "../../server/ai/redact";

type ResolveAiConfig = (request: Request) => Promise<AiRuntimeResolution>;

export function createAiHandler(resolveConfig: ResolveAiConfig = resolveAiRuntime) {
  return async function handleAi(request: NextRequest) {
  const rl = rateLimit(request, "ai");
  if (!rl.allowed) return NextResponse.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 });

  try {
    const requestData = await request.json();
    const { problem: requestedProblem } = requestData;
    const revise = requestData.mode === "revise";
    const currentCode = typeof requestData.code === "string" ? requestData.code : "";
    if (revise && (!currentCode.trim() || currentCode.length > 40_000)) {
      return NextResponse.json({ error: "当前代码为空或超过 40000 字符" }, { status: 400 });
    }
    let problem = requestedProblem;
    const resolved = await resolveConfig(request);
    if (!resolved.ok) return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    const { apiKey, endpoint, model } = resolved.config;
    if (!problem) return NextResponse.json({ error: "题目数据不完整" }, { status: 400 });

    const chatUrl = validateEndpoint(String(endpoint));
    problem = await buildOutboundProblemContext(problem);
    const serializedProblem = serializeOutboundProblemContext(problem);

    const response = await fetch(chatUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model,
        temperature: AI_DEFAULT_TEMPERATURE,
        max_tokens: AI_MAX_TOKENS_SOLUTION,
        messages: [
          { role: "system", content: revise
            ? "你是算法竞赛代码审阅与修复助手。用户会提供一份已经写好的 GNU C++17 代码。保留原有正确逻辑和结构，只修复编译错误、明显逻辑错误、边界条件或复杂度问题。只输出修改后的完整源代码，不要 Markdown、解释或省略任何代码。"
            : "你是算法竞赛助手。只输出一份可直接提交的 GNU C++17 完整源代码，不要 Markdown 或解释。程序必须包含 main 函数，从标准输入读取并向标准输出写入答案。优先使用 bits/stdc++.h、快速 I/O，并注意整数溢出。" },
          { role: "user", content: revise
            ? `以下是只读题目数据(JSON)：\n${serializedProblem}\n\n以下是用户当前代码，请基于它修改：\n${currentCode}`
            : `以下是只读题目数据(JSON)：\n${serializedProblem}` },
        ],
      }),
    });

    const data = await response.json() as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (!response.ok) return NextResponse.json({ error: redactSensitiveText(data.error?.message || "上游 AI 服务请求失败", [apiKey]) }, { status: response.status });
    return NextResponse.json({ code: data.choices?.[0]?.message?.content || "" });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("不支持的 API")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: redactSensitiveText(error instanceof Error ? error : "AI 请求失败") }, { status: 500 });
  }
  };
}

export const POST = createAiHandler();
