import { NextRequest, NextResponse } from "next/server";

type UpstreamData = { choices?: { message?: { content?: string } }[]; error?: { message?: string } };

function resolveChatUrl(endpoint: string) {
  const url = new URL(endpoint.trim());
  if (url.protocol !== "https:") throw new Error("API Endpoint 必须使用 HTTPS");
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = /\/chat\/completions$/i.test(path) ? path : `${path}/chat/completions`;
  return url;
}

export async function POST(request: NextRequest) {
  try {
    const { apiKey, endpoint, model, problem, count } = await request.json();
    const target = [12, 18, 24].includes(Number(count)) ? Number(count) : 18;
    if (!apiKey || !endpoint || !model || !problem) return NextResponse.json({ error: "AI 配置和题目信息不完整" }, { status: 400 });
    const chatUrl = resolveChatUrl(String(endpoint));
    const body: Record<string, unknown> = {
      model,
      temperature: 0.1,
      max_tokens: 5000,
      stream: false,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `你是专业在线评测系统（OJ）的测试数据工程师。请为给定算法题生成恰好 ${target} 个互不重复、输入输出完全正确的测试点。

覆盖配额：最小/零边界至少 3 个；最大值/上界至少 3 个；单元素、重复、递增、递减等特殊结构至少 4 个；普通中等规模至少 4 个；针对溢出、下标、精度、贪心等常见错误的反例至少 3 个。只使用题目约束允许的数据。

只返回以下 JSON，不得输出 Markdown 或说明：
{"tests":[{"id":1,"input":"标准输入文本\\n","output":"标准输出文本\\n"}]}

硬性规则：tests 恰好 ${target} 项；id 从 1 连续递增；input/output 均为字符串；亲自计算并复核每个 output；不得复制已有测试点；不得添加其他字段。`,
        },
        {
          role: "user",
          content: `题号：${problem.id}\n标题：${problem.title}\n描述：${problem.description}\n输入格式：${problem.inputFormat}\n输出格式：${problem.outputFormat}\n已有测试点（不得重复）：${JSON.stringify(problem.samples || [])}`,
        },
      ],
    };
    if (/(^|\.)api\.deepseek\.com$/i.test(chatUrl.hostname)) body.thinking = { type: "disabled" };
    const response = await fetch(chatUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
    const text = await response.text();
    let data: UpstreamData;
    try { data = JSON.parse(text) as UpstreamData; }
    catch { return NextResponse.json({ error: `AI 服务返回异常（HTTP ${response.status}）` }, { status: 502 }); }
    if (!response.ok) return NextResponse.json({ error: data.error?.message || "上游 AI 服务请求失败" }, { status: response.status });
    const content = data.choices?.[0]?.message?.content?.trim() || "";
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const parsed = JSON.parse(cleaned) as { tests?: unknown[] };
    if (!Array.isArray(parsed.tests) || parsed.tests.length < Math.min(12, target)) {
      return NextResponse.json({ error: `AI 生成的有效测试点不足 ${Math.min(12, target)} 个，请重试` }, { status: 422 });
    }
    const tests = parsed.tests.slice(0, target).map((item, index) => {
      const test = item as { input?: unknown; output?: unknown };
      if (typeof test.input !== "string" || typeof test.output !== "string") throw new Error(`第 ${index + 1} 个测试点格式错误`);
      return { id: Date.now() + index, input: test.input, output: test.output };
    });
    return NextResponse.json({ tests });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 测试点生成失败";
    if (/timeout|timed out|abort/i.test(message) || (error instanceof Error && error.name === "TimeoutError")) return NextResponse.json({ error: "AI 响应超时，请重试或减少测试点数量" }, { status: 504 });
    if (/fetch failed|network|socket|connect/i.test(message)) return NextResponse.json({ error: "暂时无法连接 AI 服务，请检查 API Endpoint 后重试" }, { status: 502 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
