import { NextRequest, NextResponse } from "next/server";

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: NextRequest) {
  try {
    const { apiKey, endpoint, model, problem, code, messages } = await request.json();
    if (!apiKey || !endpoint || !model || !problem) return NextResponse.json({ error: "AI 配置不完整" }, { status: 400 });
    if (!/^https:\/\//i.test(String(endpoint))) return NextResponse.json({ error: "API Endpoint 必须使用 HTTPS" }, { status: 400 });
    const conversation = Array.isArray(messages)
      ? messages.slice(-16).filter((item): item is ChatMessage =>
          item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string" && item.content.trim().length > 0)
      : [];
    if (!conversation.length) return NextResponse.json({ error: "请输入问题" }, { status: 400 });

    const base = String(endpoint).replace(/\/$/, "");
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 2048,
        messages: [
          {
            role: "system",
            content: `你是耐心的算法竞赛 C++17 教练。回答用户关于当前题目的疑问，优先讲清思路、复杂度、边界情况和代码错误。除非用户明确要求，否则不要直接给出完整答案。当前题目：${problem.id} ${problem.title}\n描述：${problem.description}\n输入：${problem.inputFormat}\n输出：${problem.outputFormat}\n测试点：${JSON.stringify(problem.samples)}\n用户当前代码：\n${String(code || "").slice(0, 12000)}`,
          },
          ...conversation,
        ],
      }),
    });
    const data = await response.json() as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (!response.ok) return NextResponse.json({ error: data.error?.message || "上游 AI 服务请求失败" }, { status: response.status });
    return NextResponse.json({ answer: data.choices?.[0]?.message?.content || "" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 对话失败" }, { status: 500 });
  }
}
