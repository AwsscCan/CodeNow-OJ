import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "../_lib/rate-limit";
import { ALLOWED_AI_HOSTS, AI_DEFAULT_TEMPERATURE, AI_MAX_TOKENS_SOLUTION } from "../_lib/constants";

function validateEndpoint(raw: string) {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("API Endpoint 格式无效");
  }
  if (url.protocol !== "https:") throw new Error("API Endpoint 必须使用 HTTPS");
  const host = url.hostname.toLowerCase();
  const allowed = ALLOWED_AI_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  if (!allowed) throw new Error(`不支持的 API 服务商：${host}。支持：${ALLOWED_AI_HOSTS.join("、")}`);
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = /\/chat\/completions$/i.test(path) ? path : `${path}/chat/completions`;
  return url;
}

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, "ai");
  if (!rl.allowed) return NextResponse.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 });

  try {
    let { apiKey, endpoint, model, problem } = await request.json();

    // Server-side env var takes precedence. Falls back to client key for backward compat.
    apiKey = process.env.AI_API_KEY || apiKey;
    if (!apiKey) return NextResponse.json({ error: "未配置 AI API Key" }, { status: 400 });

    if (!endpoint || !model || !problem) return NextResponse.json({ error: "AI 配置不完整" }, { status: 400 });

    const chatUrl = validateEndpoint(String(endpoint));

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
          { role: "user", content: `题目：${problem.title}\n描述：${problem.description}\n输入：${problem.inputFormat}\n输出：${problem.outputFormat}\n测试点：${JSON.stringify(problem.samples)}` },
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
