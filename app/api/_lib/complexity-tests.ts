type UpstreamData = { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
type Part = { type?: unknown; value?: unknown; count?: unknown; separator?: unknown; start?: unknown; end?: unknown; step?: unknown; values?: unknown };
type RawTest = { input?: unknown; output?: unknown; inputParts?: unknown; outputParts?: unknown; category?: unknown; scale?: unknown; targets?: unknown; reason?: unknown };
type GeneratedTest = { input: string; output: string; category: string; scale: number; targets: string; reason: string };
type ComplexityPlan = { expectedTimeComplexity: string; expectedSpaceComplexity: string; bruteForceToReject: string[]; stressScale: number; stressInputStrategy: string };

const MAX_EXPANDED_CHARS = 300_000;

function resolveChatUrl(endpoint: string) {
  const url = new URL(endpoint.trim());
  if (url.protocol !== "https:") throw new Error("API Endpoint 必须使用 HTTPS");
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = /\/chat\/completions$/i.test(path) ? path : `${path}/chat/completions`;
  return url;
}

function parseJson(content: string): unknown {
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");
  const arrayStart = cleaned.indexOf("[");
  const arrayEnd = cleaned.lastIndexOf("]");
  if (objectStart >= 0 && objectEnd > objectStart) return JSON.parse(cleaned.slice(objectStart, objectEnd + 1));
  if (arrayStart >= 0 && arrayEnd > arrayStart) return JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
  throw new Error("AI 未返回可解析的 JSON");
}

function appendWithinLimit(chunks: string[], value: string, size: { value: number }) {
  size.value += value.length;
  if (size.value > MAX_EXPANDED_CHARS) throw new Error("展开后的单个测试点超过 300 KB");
  chunks.push(value);
}

function expandParts(parts: unknown): string {
  if (!Array.isArray(parts)) throw new Error("压缩测试点 parts 必须是数组");
  const chunks: string[] = [];
  const size = { value: 0 };
  for (const raw of parts as Part[]) {
    if (!raw || typeof raw !== "object") throw new Error("测试点 parts 项格式错误");
    const type = String(raw.type || "");
    const separator = typeof raw.separator === "string" ? raw.separator : "";
    if (type === "literal") appendWithinLimit(chunks, String(raw.value ?? ""), size);
    else if (type === "repeat") {
      const count = Math.floor(Number(raw.count));
      if (!Number.isFinite(count) || count < 0 || count > 100_000) throw new Error("repeat count 超出范围");
      const value = String(raw.value ?? "");
      appendWithinLimit(chunks, Array.from({ length: count }, () => value).join(separator), size);
    } else if (type === "cycle") {
      const count = Math.floor(Number(raw.count));
      const values = Array.isArray(raw.values) ? raw.values.map(String) : [];
      if (!values.length || !Number.isFinite(count) || count < 0 || count > 100_000) throw new Error("cycle 参数超出范围");
      appendWithinLimit(chunks, Array.from({ length: count }, (_, index) => values[index % values.length]).join(separator), size);
    } else if (type === "range") {
      const start = Number(raw.start); const end = Number(raw.end); const step = Number(raw.step ?? (end >= start ? 1 : -1));
      if (![start, end, step].every(Number.isFinite) || step === 0) throw new Error("range 参数错误");
      const count = Math.floor((end - start) / step) + 1;
      if (count < 0 || count > 100_000) throw new Error("range 数量超出范围");
      appendWithinLimit(chunks, Array.from({ length: count }, (_, index) => String(start + index * step)).join(separator), size);
    } else throw new Error(`不支持的测试点 parts 类型：${type}`);
  }
  return chunks.join("");
}

function materialize(value: unknown, parts: unknown) {
  const text = typeof value === "string" ? value : parts !== undefined ? expandParts(parts) : "";
  if (!text || text.length > MAX_EXPANDED_CHARS) throw new Error("测试点输入或输出为空/过大");
  return text;
}

function parseTests(content: string): GeneratedTest[] {
  const parsed = parseJson(content);
  const list = Array.isArray(parsed) ? parsed : (parsed as { tests?: unknown[] })?.tests;
  if (!Array.isArray(list)) throw new Error("AI 返回的 JSON 缺少 tests 数组");
  return list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const test = item as RawTest;
    try {
      return [{
        input: materialize(test.input, test.inputParts),
        output: materialize(test.output, test.outputParts),
        category: String(test.category || "ordinary").toLowerCase(),
        scale: Math.max(1, Math.floor(Number(test.scale) || 1)),
        targets: String(test.targets || ""),
        reason: String(test.reason || ""),
      }];
    } catch { return []; }
  });
}

export async function generateComplexityAwareTests(options: { apiKey: string; endpoint: string; model: string; problem: Record<string, unknown>; count: number }) {
  const { apiKey, endpoint, model, problem } = options;
  const target = Math.max(6, Math.min(24, Math.floor(options.count)));
  const chatUrl = resolveChatUrl(endpoint);
  const isDeepSeek = /(^|\.)api\.deepseek\.com$/i.test(chatUrl.hostname);

  async function callAi(messages: { role: string; content: string }[], maxTokens: number, temperature = 0.1) {
    async function send(jsonMode: boolean) {
      const body: Record<string, unknown> = { model, temperature, max_tokens: maxTokens, stream: false, messages };
      if (jsonMode) body.response_format = { type: "json_object" };
      if (isDeepSeek) body.thinking = { type: "disabled" };
      return fetch(chatUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(40_000) });
    }
    let response = await send(true);
    if (!response.ok && (response.status === 400 || response.status === 422)) response = await send(false);
    const text = await response.text();
    let data: UpstreamData;
    try { data = JSON.parse(text) as UpstreamData; } catch { throw new Error(`AI 服务返回异常（HTTP ${response.status}）`); }
    if (!response.ok) throw new Error(data.error?.message || `上游 AI 服务请求失败（HTTP ${response.status}）`);
    return data.choices?.[0]?.message?.content || "";
  }

  const problemText = `题号：${String(problem.id || "")}
标题：${String(problem.title || "")}
时间限制：${String(problem.time || "未知")}
内存限制：${String(problem.memory || "未知")}
描述：${String(problem.description || "")}
输入格式：${String(problem.inputFormat || "")}
输出格式：${String(problem.outputFormat || "")}`;
  const planContent = await callAi([
    { role: "system", content: `你是 OJ 数据与复杂度分析专家。分析题目要求的合理时空复杂度，以及需要被性能测试淘汰的暴力算法。只返回 JSON：{"expectedTimeComplexity":"...","expectedSpaceComplexity":"...","bruteForceToReject":["..."],"stressScale":整数,"stressInputStrategy":"..."}。stressScale 必须是在题目约束内、足以让最主要暴力算法超时或超内存的输入主规模；不得虚构超出题面范围的数据。` },
    { role: "user", content: problemText },
  ], 900, 0.05);
  const planRaw = parseJson(planContent) as Partial<ComplexityPlan>;
  const plan: ComplexityPlan = {
    expectedTimeComplexity: String(planRaw.expectedTimeComplexity || "题目允许的最优复杂度"),
    expectedSpaceComplexity: String(planRaw.expectedSpaceComplexity || "题目允许的空间复杂度"),
    bruteForceToReject: Array.isArray(planRaw.bruteForceToReject) ? planRaw.bruteForceToReject.map(String).filter(Boolean).slice(0, 6) : [],
    stressScale: Math.max(1, Math.floor(Number(planRaw.stressScale) || 1)),
    stressInputStrategy: String(planRaw.stressInputStrategy || "在题目约束内取最大规模"),
  };
  if (!plan.bruteForceToReject.length || plan.stressScale <= 1) throw new Error("AI 未能给出可信的复杂度压力测试计划，请补充题目数据范围后重试");

  const requiredPerformance = Math.max(2, Math.ceil(target / 8));
  const requiredAdversarial = Math.max(2, Math.ceil(target / 8));
  const minimumStressScale = Math.max(2, Math.floor(plan.stressScale * 0.8));
  const existingInputs = Array.isArray(problem.samples) ? problem.samples : [];
  const compactExisting = (items: unknown[]) => items.slice(-24).map((raw) => {
    const item = raw as { input?: unknown; output?: unknown };
    return { input: String(item.input || "").slice(0, 180), output: String(item.output || "").slice(0, 100) };
  });

  async function callBatch(batchSize: number, focus: string, forbidden: GeneratedTest[], performanceQuota: number, adversarialQuota: number) {
    const schema = `{"tests":[{"input":"可直接使用的输入文本","output":"正确输出文本","category":"boundary|special|ordinary|adversarial|performance","scale":主规模整数,"targets":"该点针对的错误或暴力算法","reason":"为何有效"}]}`;
    const compressed = `当大数据无法直接写完时，可用 inputParts/outputParts 代替对应字符串。parts 仅允许：{"type":"literal","value":"..."}、{"type":"repeat","value":"7","count":100000,"separator":" "}、{"type":"range","start":1,"end":100000,"step":1,"separator":" "}、{"type":"cycle","values":["0","1"],"count":100000,"separator":" "}。可组合多段，换行用 literal。`;
    const content = await callAi([
      { role: "system", content: `你是专业 OJ 测试数据工程师。本批生成恰好 ${batchSize} 个确定性测试点，重点：${focus}。

复杂度计划：期望时间 ${plan.expectedTimeComplexity}；期望空间 ${plan.expectedSpaceComplexity}；必须卡掉 ${plan.bruteForceToReject.join("、")}；压力主规模 ${plan.stressScale}；策略 ${plan.stressInputStrategy}。
本批至少 ${performanceQuota} 个 category=performance，至少 ${adversarialQuota} 个 category=adversarial。performance 的 scale 必须达到 ${minimumStressScale}；若输入格式含显式 n/m，该规模数字必须真实出现在展开后的 input 中；若规模由字符串或数据长度隐式决定，展开后的有效数据长度必须达到 scale。targets 必须明确指出会超时/超内存的暴力算法。adversarial 必须给出具体反例目标。

只返回 JSON ${schema}。${compressed}
硬性规则：严格遵守题目约束与输入组数；独立计算并复核 output；不得只改标签伪装压力测试；不得输出解释或 Markdown；不得重复禁用测试点。` },
      { role: "user", content: `${problemText}
已有/禁用测试点摘要：${JSON.stringify([...compactExisting(existingInputs), ...compactExisting(forbidden)])}` },
    ], 2600, 0.12);
    return parseTests(content).slice(0, batchSize);
  }

  function qualifiesPerformance(test: GeneratedTest) {
    const compactLength = test.input.replace(/\s/g, "").length;
    const scaleIsPresent = test.input.includes(String(test.scale)) || compactLength >= test.scale;
    return test.category === "performance" && test.scale >= minimumStressScale && scaleIsPresent && test.targets.trim().length >= 4;
  }
  function qualifiesAdversarial(test: GeneratedTest) {
    return test.category === "adversarial" && test.targets.trim().length >= 4 && test.reason.trim().length >= 4;
  }

  const batchCount = Math.ceil(target / 6);
  const focuses = [
    "最小值、上下界、溢出、精度与特殊结构",
    batchCount === 2 ? "一半复杂度压力点、一半针对错误或暴力算法的强反例" : "针对贪心、枚举、错误状态或错误边界的强反例",
    "接近数据上限的性能与内存压力点，确保暴力算法不能通过",
    "补充最大规模、退化结构和最坏复杂度数据",
  ];
  const settled = await Promise.allSettled(Array.from({ length: batchCount }, (_, index) => {
    const size = Math.min(6, target - index * 6);
    const perf = batchCount === 2 && index === 1 ? 3 : index >= 2 ? Math.min(3, size) : 0;
    const adversarial = index === 1 ? Math.min(3, size - perf) : index === 3 ? Math.min(2, size - perf) : 0;
    return callBatch(size, focuses[index], [], perf, adversarial);
  }));
  const failures = settled.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
  const candidates = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!candidates.length && failures.length) throw failures[0];

  const fingerprints = new Set<string>((existingInputs as { input?: unknown; output?: unknown }[]).map((test) => `${String(test.input || "")}\u0000${String(test.output || "")}`));
  const unique: GeneratedTest[] = [];
  let rejectedComplexity = 0;
  function merge(items: GeneratedTest[]) {
    for (const test of items) {
      if (test.category === "performance" && !qualifiesPerformance(test)) { rejectedComplexity += 1; continue; }
      if (test.category === "adversarial" && !qualifiesAdversarial(test)) { rejectedComplexity += 1; continue; }
      const key = `${test.input}\u0000${test.output}`;
      if (!fingerprints.has(key)) { fingerprints.add(key); unique.push(test); }
    }
  }
  merge(candidates);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const perfMissing = Math.max(0, requiredPerformance - unique.filter(qualifiesPerformance).length);
    const advMissing = Math.max(0, requiredAdversarial - unique.filter(qualifiesAdversarial).length);
    const totalMissing = Math.max(0, target - unique.length);
    if (!perfMissing && !advMissing && !totalMissing) break;
    try {
      merge(await callBatch(6, `重新生成未通过校验的数据：补足 ${perfMissing} 个有效性能点、${advMissing} 个有效反例及 ${totalMissing} 个普通点`, unique, Math.min(6, perfMissing), Math.min(6 - Math.min(6, perfMissing), advMissing)));
    } catch { /* final coverage check below reports a useful error */ }
  }

  const performance = unique.filter(qualifiesPerformance);
  const adversarial = unique.filter(qualifiesAdversarial);
  if (performance.length < requiredPerformance || adversarial.length < requiredAdversarial || unique.length < target) {
    throw new Error(`复杂度校验未通过：获得 ${performance.length}/${requiredPerformance} 个性能点、${adversarial.length}/${requiredAdversarial} 个强反例、共 ${unique.length}/${target} 个有效点；不合格数据已丢弃，请重试`);
  }
  const selected: GeneratedTest[] = [];
  const selectedKeys = new Set<string>();
  function select(items: GeneratedTest[], limit: number) {
    for (const test of items) {
      if (selected.length >= target || limit <= 0) break;
      const key = `${test.input}\u0000${test.output}`;
      if (!selectedKeys.has(key)) { selectedKeys.add(key); selected.push(test); limit -= 1; }
    }
  }
  select(performance, requiredPerformance);
  select(adversarial, requiredAdversarial);
  select(unique, target);
  return {
    tests: selected.slice(0, target).map(({ input, output }) => ({ input, output })),
    report: { expectedTimeComplexity: plan.expectedTimeComplexity, expectedSpaceComplexity: plan.expectedSpaceComplexity, stressScale: plan.stressScale, performanceCount: selected.filter(qualifiesPerformance).length, adversarialCount: selected.filter(qualifiesAdversarial).length, rejectedAndRegenerated: rejectedComplexity },
  };
}
