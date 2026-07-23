import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { apiKey, endpoint, model, problem } = await request.json();
    if (!apiKey || !endpoint || !model || !problem) return NextResponse.json({ error: "AI 配置不完整" }, { status: 400 });
    if (!/^https:\/\//i.test(String(endpoint))) return NextResponse.json({ error: "API Endpoint 必须使用 HTTPS" }, { status: 400 });
    const base = String(endpoint).replace(/\/$/, "");
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.15,
        max_tokens: 4096,
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 请求失败" }, { status: 500 });
  }
}
