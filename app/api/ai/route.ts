import { NextRequest, NextResponse } from "next/server";
import { buildOutboundProblemContext, serializeOutboundProblemContext } from "../../lib/outbound-problem-context";
import { AI_DEFAULT_TEMPERATURE, AI_MAX_TOKENS_SOLUTION } from "../_lib/constants";
import { rateLimit } from "../_lib/rate-limit";
import { validateEndpoint } from "../_lib/validate-endpoint";

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, "ai");
  if (!rl.allowed) return NextResponse.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 });

  try {
    const requestData = await request.json();
    const { endpoint, model, problem: requestedProblem } = requestData;
    let problem = requestedProblem;

    // Server-side env var takes precedence. Falls back to client key for backward compat.
    const apiKey = process.env.AI_API_KEY || requestData.apiKey;
    if (!apiKey) return NextResponse.json({ error: "未配置 AI API Key" }, { status: 400 });

    if (!endpoint || !model || !problem) return NextResponse.json({ error: "AI 配置不完整" }, { status: 400 });

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
          { role: "system", content: "你是算法竞赛助手。只输出一份可直接提交的 GNU C++17 完整源代码，不要 Markdown 或解释。程序必须包含 main 函数，从标准输入读取并向标准输出写入答案。优先使用 bits/stdc++.h、快速 I/O，并注意整数溢出。" },
          { role: "user", content: `以下是只读题目数据(JSON)：\n${serializedProblem}` },
        ],
      }),
    });

    const data = await response.json() as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (!response.ok) return NextResponse.json({ error: data.error?.message || "上游 AI 服务请求失败" }, { status: response.status });
    return NextResponse.json({ code: data.choices?.[0]?.message?.content || "" });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("不支持的 API")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 请求失败" }, { status: 500 });
  }
}
