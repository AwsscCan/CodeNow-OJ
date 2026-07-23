import { NextRequest, NextResponse } from "next/server";

type UpstreamData = { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
type RawTest = { input: string; output: string };

function resolveChatUrl(endpoint: string) {
  const url = new URL(endpoint.trim());
  if (url.protocol !== "https:") throw new Error("API Endpoint 必须使用 HTTPS");
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = /\/chat\/completions$/i.test(path) ? path : `${path}/chat/completions`;
  return url;
}

function parseTests(content: string): RawTest[] {
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");
  const arrayStart = cleaned.indexOf("[");
  const arrayEnd = cleaned.lastIndexOf("]");
  let parsed: unknown;
  if (objectStart >= 0 && objectEnd > objectStart) parsed = JSON.parse(cleaned.slice(objectStart, objectEnd + 1));
  else if (arrayStart >= 0 && arrayEnd > arrayStart) parsed = JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
  else throw new Error("AI 未返回可解析的测试点 JSON");
  const list = Array.isArray(parsed) ? parsed : (parsed as { tests?: unknown[] })?.tests;
  if (!Array.isArray(list)) throw new Error("AI 返回的 JSON 缺少 tests 数组");
  return list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const test = item as { input?: unknown; output?: unknown };
    return typeof test.input === "string" && typeof test.output === "string" ? [{ input: test.input, output: test.output }] : [];
  });
}

export async function POST(request: NextRequest) {
  try {
    const { apiKey, endpoint, model, problem, count } = await request.json();
    const target = [12, 18, 24].includes(Number(count)) ? Number(count) : 18;
    if (!apiKey || !endpoint || !model || !problem) return NextResponse.json({ error: "AI 配置和题目信息不完整" }, { status: 400 });
    const chatUrl = resolveChatUrl(String(endpoint));
    const isDeepSeek = /(^|\.)api\.deepseek\.com$/i.test(chatUrl.hostname);
    const focuses = [
      "最小规模、零值、单元素、空边界和下界附近数据",
      "最大规模、上界附近、整数溢出、精度和极端值",
      "全相同、重复值、递增、递减、交替和特殊结构",
      "普通中等规模数据，以及能击穿常见错误算法的反例",
    ];

    async function callBatch(batchSize: number, focus: string, forbidden: RawTest[]): Promise<RawTest[]> {
      const messages = [
        {
          role: "system",
          content: `你是专业在线评测系统（OJ）的测试数据工程师。本批只生成 ${batchSize} 个测试点，重点覆盖：${focus}。

只返回 JSON：{"tests":[{"input":"标准输入文本\\n","output":"标准输出文本\\n"}]}

硬性规则：tests 必须恰好 ${batchSize} 项；input/output 必须是字符串；严格遵守题目约束和输入组数；独立计算并复核每个 output；不得输出解释、Markdown 或额外字段；不得重复已有或禁用测试点。`,
        },
        {
          role: "user",
          content: `题号：${problem.id}\n标题：${problem.title}\n描述：${problem.description}\n输入格式：${problem.inputFormat}\n输出格式：${problem.outputFormat}\n已有及禁用测试点：${JSON.stringify([...(problem.samples || []), ...forbidden].slice(-30))}`,
        },
      ];

      async function send(jsonMode: boolean) {
        const body: Record<string, unknown> = { model, temperature: 0.15, max_tokens: 1800, stream: false, messages };
        if (jsonMode) body.response_format = { type: "json_object" };
        if (isDeepSeek) body.thinking = { type: "disabled" };
        return fetch(chatUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(35_000),
        });
      }

      let response = await send(true);
      if (!response.ok && (response.status === 400 || response.status === 422)) response = await send(false);
      const text = await response.text();
      let data: UpstreamData;
      try { data = JSON.parse(text) as UpstreamData; }
      catch { throw new Error(`AI 服务返回异常（HTTP ${response.status}）`); }
      if (!response.ok) throw new Error(data.error?.message || `上游 AI 服务请求失败（HTTP ${response.status}）`);
      const tests = parseTests(data.choices?.[0]?.message?.content || "");
      if (!tests.length) throw new Error("AI 没有返回有效测试点");
      return tests.slice(0, batchSize);
    }

    const batchCount = target / 6;
    const settled = await Promise.allSettled(Array.from({ length: batchCount }, (_, index) => callBatch(6, focuses[index], [])));
    const generated = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const failures = settled.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
    if (!generated.length && failures.length) throw failures[0];

    const existing = new Set<string>((problem.samples || []).map((test: RawTest) => `${test.input}\u0000${test.output}`));
    const unique: RawTest[] = [];
    function merge(items: RawTest[]) {
      for (const item of items) {
        const key = `${item.input}\u0000${item.output}`;
        if (!existing.has(key)) {
          existing.add(key);
          unique.push(item);
        }
      }
    }
    merge(generated);

    for (let attempt = 0; unique.length < target && attempt < 2; attempt++) {
      const missing = Math.min(6, target - unique.length);
      try { merge(await callBatch(missing, "补足前面批次未覆盖的边界与易错反例，必须与禁用列表完全不同", unique)); }
      catch { /* return the valid batches when a repair batch fails */ }
    }

    if (unique.length < Math.min(8, target)) return NextResponse.json({ error: `仅获得 ${unique.length} 个有效测试点，请重试` }, { status: 422 });
    const tests = unique.slice(0, target).map((test, index) => ({ id: Date.now() + index, ...test }));
    return NextResponse.json({ tests, warning: tests.length < target ? `目标 ${target} 个，实际生成 ${tests.length} 个有效且不重复的测试点` : null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 测试点生成失败";
    if (/timeout|timed out|abort/i.test(message) || (error instanceof Error && error.name === "TimeoutError")) return NextResponse.json({ error: "AI 响应超时，请重试或减少测试点数量" }, { status: 504 });
    if (/fetch failed|network|socket|connect/i.test(message)) return NextResponse.json({ error: "暂时无法连接 AI 服务，请检查 API Endpoint 后重试" }, { status: 502 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
