import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "../_lib/rate-limit";
import { ALLOWED_AI_HOSTS, AI_CHAT_TEMPERATURE, AI_MAX_TOKENS_CHAT, AI_MAX_CODE_CONTEXT_LENGTH } from "../_lib/constants";

type ChatMessage = { role: "user" | "assistant"; content: string };

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
    let { apiKey, endpoint, model, problem, code, messages } = await request.json();

    apiKey = process.env.AI_API_KEY || apiKey;
    if (!apiKey) return NextResponse.json({ error: "未配置 AI API Key" }, { status: 400 });

    if (!endpoint || !model || !problem) return NextResponse.json({ error: "AI 配置不完整" }, { status: 400 });

    const chatUrl = validateEndpoint(String(endpoint));

    const conversation = Array.isArray(messages)
      ? messages.slice(-16).filter((item): item is ChatMessage =>
          item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string" && item.content.trim().length > 0)
      : [];
    if (!conversation.length) return NextResponse.json({ error: "请输入问题" }, { status: 400 });

    const response = await fetch(chatUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model,
        temperature: AI_CHAT_TEMPERATURE,
        max_tokens: AI_MAX_TOKENS_CHAT,
        messages: [
          {
            role: "system",
            content: `你是耐心的算法竞赛 C++17 教练。回答用户关于当前题目的疑问，优先讲清思路、复杂度、边界情况和代码错误。除非用户明确要求，否则不要直接给出完整答案。当前题目：${problem.id} ${problem.title}\n描述：${problem.description}\n输入：${problem.inputFormat}\n输出：${problem.outputFormat}\n测试点：${JSON.stringify(problem.samples)}\n用户当前代码：\n${String(code || "").slice(0, AI_MAX_CODE_CONTEXT_LENGTH)}`,
          },
          ...conversation,
        ],
      }),
    });

    const data = await response.json() as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (!response.ok) return NextResponse.json({ error: data.error?.message || "上游 AI 服务请求失败" }, { status: response.status });
    return NextResponse.json({ answer: data.choices?.[0]?.message?.content || "" });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("不支持的 API")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 对话失败" }, { status: 500 });
  }
}
