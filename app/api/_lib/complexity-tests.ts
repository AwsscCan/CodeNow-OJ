type UpstreamData = { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
type Part = { type?: unknown; value?: unknown; count?: unknown; separator?: unknown; start?: unknown; end?: unknown; step?: unknown; values?: unknown };
type RawTest = {
  input?: unknown; output?: unknown; stdin?: unknown; stdout?: unknown; expected?: unknown; expectedOutput?: unknown; expected_output?: unknown; answer?: unknown;
  input_data?: unknown; output_data?: unknown; in?: unknown; out?: unknown; inputParts?: unknown; outputParts?: unknown;
  category?: unknown; scale?: unknown; targets?: unknown; reason?: unknown;
} & Record<string, unknown>;
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
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const candidates = extractJsonCandidates(cleaned);
  for (const candidate of candidates) {
    for (const attempt of repairJsonCandidates(candidate)) {
      try { return JSON.parse(attempt); } catch { /* try next repair */ }
    }
  }
  throw new Error("AI 未返回可解析的 JSON");
}

function extractJsonCandidates(text: string) {
  const candidates: string[] = [];
  for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
    const start = text.indexOf(open);
    if (start < 0) continue;
    const end = findMatchingJsonEnd(text, start, open, close);
    if (end > start) candidates.push(text.slice(start, end + 1));
  }
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(text.slice(objectStart, objectEnd + 1));
  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(text.slice(arrayStart, arrayEnd + 1));
  return Array.from(new Set(candidates));
}

function findMatchingJsonEnd(text: string, start: number, open: string, close: string) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function repairJsonCandidates(value: string) {
  const normalized = value
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
  const missingCommaFixed = normalized
    .replace(/("(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?|[}\]])\s*\n\s*("[$A-Z_a-z][^"]*"\s*:)/g, "$1,\n$2")
    .replace(/("(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?|[}\]])\s+(?="[$A-Z_a-z][^"]*"\s*:)/g, "$1,");
  const singleQuoteFixed = missingCommaFixed.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'\s*:/g, (_, key: string) => `"${key.replace(/"/g, '\\"')}":`);
  return Array.from(new Set([value, normalized, missingCommaFixed, singleQuoteFixed]));
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

function stringifyField(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (Array.isArray(value)) return value.map((item) => Array.isArray(item) ? item.map(String).join(" ") : String(item)).join("\n");
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const key of ["text", "content", "value", "data", "raw", "文本", "内容", "值", "数据"]) {
      const nested = stringifyField(object[key]);
      if (nested.trim()) return nested;
    }
  }
  return "";
}

function normalizeText(value: string) {
  const text = value.includes("\\n") && !value.includes("\n") ? value.replace(/\\n/g, "\n") : value;
  return text.endsWith("\n") ? text : `${text}\n`;
}

function materialize(value: unknown, parts: unknown) {
  const text = parts !== undefined ? expandParts(parts) : stringifyField(value);
  if (!text || text.length > MAX_EXPANDED_CHARS) throw new Error("测试点输入或输出为空/过大");
  return normalizeText(text);
}

function readFirst(test: RawTest, keys: string[]) {
  for (const key of keys) {
    const value = test[key];
    if (value !== undefined && value !== null && stringifyField(value).trim() !== "") return value;
  }
  return undefined;
}

function findTestList(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return null;
  const object = parsed as Record<string, unknown>;
  for (const key of ["tests", "testCases", "testcases", "cases", "samples", "data", "测试点", "测试数据", "用例", "样例"]) {
    if (Array.isArray(object[key])) return object[key] as unknown[];
  }
  const objectValues = Object.values(object);
  if (objectValues.length && objectValues.every((value) => value && typeof value === "object" && !Array.isArray(value))) {
    const likelyTests = objectValues.filter((value) => {
      const item = value as Record<string, unknown>;
      return ["input", "stdin", "输入", "输入数据"].some((key) => stringifyField(item[key]).trim()) &&
        ["output", "stdout", "expectedOutput", "expected_output", "expected", "answer", "输出", "标准输出", "预期输出", "答案"].some((key) => stringifyField(item[key]).trim());
    });
    if (likelyTests.length) return likelyTests;
  }
  for (const value of Object.values(object)) {
    const nested = findTestList(value);
    if (nested) return nested;
  }
  return null;
}

function parseTests(content: string): GeneratedTest[] {
  const parsed = parseJson(content);
  const list = findTestList(parsed);
  if (!Array.isArray(list)) throw new Error("AI 返回的 JSON 缺少 tests 数组");
  return list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const test = item as RawTest;
    const input = readFirst(test, ["input", "stdin", "input_data", "in", "输入", "输入数据", "标准输入", "测试输入", "样例输入"]);
    const output = readFirst(test, ["output", "stdout", "expectedOutput", "expected_output", "expected", "answer", "output_data", "out", "输出", "输出数据", "标准输出", "预期输出", "期望输出", "答案", "样例输出"]);
    try {
      return [{
        input: materialize(input, test.inputParts),
        output: materialize(output, test.outputParts),
        category: String(test.category || "ordinary").toLowerCase(),
        scale: Math.max(1, Math.floor(Number(test.scale) || 1)),
        targets: String(test.targets || ""),
        reason: String(test.reason || ""),
      }];
    } catch { return []; }
  });
}

function buildProblemText(problem: Record<string, unknown>) {
  return `题号：${String(problem.id || "")}
标题：${String(problem.title || "")}
时间限制：${String(problem.time || "未知")}
内存限制：${String(problem.memory || "未知")}
题目描述：
${String(problem.description || "")}

输入格式：
${String(problem.inputFormat || "")}

输出格式：
${String(problem.outputFormat || "")}`;
}

function makePlan(parsed: unknown): ComplexityPlan {
  const planRaw = (parsed && typeof parsed === "object" ? (parsed as { analysis?: Partial<ComplexityPlan> }).analysis : {}) || {};
  return {
    expectedTimeComplexity: String(planRaw.expectedTimeComplexity || "未明确"),
    expectedSpaceComplexity: String(planRaw.expectedSpaceComplexity || "未明确"),
    bruteForceToReject: Array.isArray(planRaw.bruteForceToReject) ? planRaw.bruteForceToReject.map(String).filter(Boolean).slice(0, 6) : [],
    stressScale: Math.max(1, Math.floor(Number(planRaw.stressScale) || 1)),
    stressInputStrategy: String(planRaw.stressInputStrategy || "在题面约束内取较大规模"),
  };
}

function buildStrictPrompt(options: { target: number; requiredPerformance: number; requiredAdversarial: number; schema: string }) {
  const { target, requiredPerformance, requiredAdversarial, schema } = options;
  return `你是在线评测系统的测试数据生成器。你必须只输出一个 JSON 对象，除此之外不能输出任何文字。

硬性输出格式：
1. 顶层必须且只能包含 "analysis" 和 "tests" 两个字段。
2. "tests" 必须是数组，长度必须是 ${target}。
3. 每个测试点对象必须使用英文键名：input、output、category、scale、targets、reason。
4. 禁止使用中文键名，例如“输入”“输出”“测试点”“答案”。
5. input 和 output 必须是字符串，必须同时存在，不能为空。
6. JSON 字符串里的换行必须写成 \\n，不能在字符串内部直接换行。
7. 不允许 Markdown，不允许代码块，不允许解释，不允许多余前后缀。

唯一允许结构：
${schema}

正确示例：
{"analysis":{"expectedTimeComplexity":"O(n)","expectedSpaceComplexity":"O(1)","bruteForceToReject":["O(n^2) 枚举"],"stressScale":100000,"stressInputStrategy":"最大 n 随机数据"},"tests":[{"input":"3\\n1 2 3\\n","output":"6\\n","category":"ordinary","scale":3,"targets":"基础正确性","reason":"检查普通样例"}]}

错误示例（禁止这样输出）：
- {"测试点":[{"输入":"...","输出":"..."}]}
- [{"stdin":"...","stdout":"..."}]
- 下面是 JSON：...
- \`\`\`json ... \`\`\`

测试点要求：
1. 严格遵守题面输入格式、数据范围和输出规则。
2. 每个 output 必须独立计算并复核，不能留空，不能写“略/待计算/unknown”。
3. 至少 ${requiredPerformance} 个 category="performance"，规模要足以淘汰明显暴力算法。
4. 至少 ${requiredAdversarial} 个 category="adversarial"，针对边界、贪心误判、溢出、特殊结构等。
5. 其余覆盖最小值、最大值、普通随机、极端分布、重复值、单调结构。
6. 不要重复已有测试点。`;
}

export async function generateComplexityAwareTests(options: { apiKey: string; endpoint: string; model: string; problem: Record<string, unknown>; count: number }) {
  const { apiKey, endpoint, model, problem } = options;
  const target = Math.max(2, Math.min(24, Math.floor(options.count)));
  const chatUrl = resolveChatUrl(endpoint);
  const isDeepSeek = /(^|\.)api\.deepseek\.com$/i.test(chatUrl.hostname);

  async function callAi(messages: { role: string; content: string }[], maxTokens: number, temperature = 0.1) {
    const deadline = Date.now() + 45_000;
    async function send(jsonMode: boolean) {
      const body: Record<string, unknown> = { model, temperature, max_tokens: maxTokens, stream: false, messages };
      if (jsonMode) body.response_format = { type: "json_object" };
      if (isDeepSeek) body.thinking = { type: "disabled" };
      const remaining = Math.max(1_000, deadline - Date.now());
      return fetch(chatUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(remaining) });
    }
    let response = await send(true);
    if (!response.ok && (response.status === 400 || response.status === 422)) response = await send(false);
    const text = await response.text();
    let data: UpstreamData;
    try { data = JSON.parse(text) as UpstreamData; } catch { throw new Error(`AI 服务返回异常（HTTP ${response.status}）`); }
    if (!response.ok) throw new Error(data.error?.message || `上游 AI 服务请求失败（HTTP ${response.status}）`);
    return data.choices?.[0]?.message?.content || "";
  }

  const requiredPerformance = target >= 6 ? Math.max(1, Math.ceil(target / 8)) : 0;
  const requiredAdversarial = target >= 6 ? Math.max(1, Math.ceil(target / 8)) : 0;
  const existingInputs = Array.isArray(problem.samples) ? problem.samples : [];
  const compactExisting = (items: unknown[]) => items.slice(-18).map((raw) => {
    const item = raw as { input?: unknown; output?: unknown };
    return { input: String(item.input || "").slice(0, 180), output: String(item.output || "").slice(0, 100) };
  });

  const schema = `{
  "analysis": {
    "expectedTimeComplexity": "例如 O(n log n)",
    "expectedSpaceComplexity": "例如 O(n)",
    "bruteForceToReject": ["会被压力点卡掉的错误/暴力算法"],
    "stressScale": 100000,
    "stressInputStrategy": "压力数据构造策略"
  },
  "tests": [
    {
      "input": "完整输入文本，必须可直接运行",
      "output": "正确输出文本",
      "category": "boundary|special|ordinary|adversarial|performance",
      "scale": 1,
      "targets": "针对什么错误算法或边界遗漏",
      "reason": "为什么这个测试点必要"
    }
  ]
}`;

  const systemPrompt = buildStrictPrompt({ target, requiredPerformance, requiredAdversarial, schema });

  const userPrompt = `${buildProblemText(problem)}

已有测试点摘要（不要重复）：
${JSON.stringify(compactExisting(existingInputs), null, 2)}`;

  let content = await callAi([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], Math.max(4200, target * 320), 0.08);

  let parsed: unknown;
  let candidates: GeneratedTest[];
  try {
    parsed = parseJson(content);
    candidates = parseTests(content);
    if (!candidates.length) throw new Error("empty-tests");
  } catch {
    const repairPrompt = `${buildStrictPrompt({ target, requiredPerformance, requiredAdversarial, schema })}

你正在修复上一次不合格的返回。上一次返回没有产生任何同时包含英文 input 和 output 的测试点。

修复任务：
1. 必须基于下面题面重新生成 ${target} 个测试点。
2. 不要沿用中文键名，不要使用 stdin/stdout。
3. 每个测试点必须有英文字符串字段 input 和 output。
4. 只返回 JSON 对象。

题面：
${buildProblemText(problem)}

已有测试点摘要（不要重复）：
${JSON.stringify(compactExisting(existingInputs), null, 2)}

上一次原始返回（仅供你理解错误，不要照抄格式）：
${content.slice(0, 12_000)}`;
    content = await callAi([{ role: "user", content: repairPrompt }], Math.max(4200, target * 300), 0.03);
    parsed = parseJson(content);
    candidates = parseTests(content);
  }

  const plan = makePlan(parsed);
  const minimumStressScale = Math.max(2, Math.floor(plan.stressScale * 0.7));

  function qualifiesPerformance(test: GeneratedTest) {
    const compactLength = test.input.replace(/\s/g, "").length;
    const scaleIsPresent = test.input.includes(String(test.scale)) || compactLength >= test.scale;
    return test.category === "performance" && test.scale >= minimumStressScale && scaleIsPresent && test.targets.trim().length >= 4;
  }
  function qualifiesAdversarial(test: GeneratedTest) {
    return test.category === "adversarial" && test.targets.trim().length >= 4 && test.reason.trim().length >= 4;
  }

  const fingerprints = new Set<string>((existingInputs as { input?: unknown; output?: unknown }[]).map((test) => `${String(test.input || "")}\u0000${String(test.output || "")}`));
  const unique: GeneratedTest[] = [];
  for (const test of candidates) {
    const key = `${test.input}\u0000${test.output}`;
    if (!fingerprints.has(key)) {
      fingerprints.add(key);
      unique.push(test);
      if (unique.length >= target) break;
    }
  }

  if (!unique.length) {
    throw new Error(`AI 没有生成可用测试点：收到的返回中没有同时包含 input 和 output 的测试点。请确认题面有完整输入输出格式，或换用更强模型后重试。`);
  }

  const performance = unique.filter(qualifiesPerformance);
  const adversarial = unique.filter(qualifiesAdversarial);
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
    report: {
      expectedTimeComplexity: plan.expectedTimeComplexity,
      expectedSpaceComplexity: plan.expectedSpaceComplexity,
      stressScale: plan.stressScale,
      performanceCount: selected.filter(qualifiesPerformance).length,
      adversarialCount: selected.filter(qualifiesAdversarial).length,
      requestedCount: target,
      generatedCount: selected.length,
      partial: selected.length < target || performance.length < requiredPerformance || adversarial.length < requiredAdversarial,
    },
  };
}
