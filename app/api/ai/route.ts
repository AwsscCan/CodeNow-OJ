import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { apiKey, endpoint, model, problem } = await request.json();
    if (!apiKey || !endpoint || !model || !problem) return NextResponse.json({ error: "AI 配置不完整" }, { status: 400 });
    const base = String(endpoint).replace(/\/$/, "");
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.15,
        messages: [
          { role: "system", content: "你是算法竞赛助手。只输出可直接运行的 JavaScript 代码，不要 Markdown。必须定义 function solve(input)，返回字符串答案；不要读取 stdin。" },
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
