import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "../_lib/rate-limit";
import {
  JUDGE0_BASE,
  MAX_TESTS_PER_RUN,
  MAX_SOURCE_LENGTH,
  MAX_SINGLE_TEST_LENGTH,
  MAX_TOTAL_TEST_LENGTH,
  CPU_TIME_LIMIT_SECONDS,
  WALL_TIME_LIMIT_SECONDS,
  MEMORY_LIMIT_KB,
  JUDGE_POLL_INTERVAL_MS,
  JUDGE_FIRST_POLL_MS,
  JUDGE_MAX_POLLS,
  JUDGE_CONCURRENCY,
} from "../_lib/constants";

type TestCase = { id: number; input: string; output: string };
type JudgeStatus = { id: number; description: string };
type JudgeResult = {
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  time?: string | null;
  status: JudgeStatus;
};

// Web Crypto compatible base64 encode/decode (no Node.js Buffer)
function encode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(value?: string | null): string {
  if (!value) return "";
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

async function getCppLanguageId() {
  const response = await fetch(`${JUDGE0_BASE}/languages`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("无法读取 C++ 编译器列表");
  const languages = await response.json() as { id: number; name: string }[];
  const preferred = languages.find((item) => item.name.includes("C++ (GCC 14"))
    || languages.find((item) => item.name.includes("C++ (GCC 9"))
    || languages.find((item) => item.name.includes("C++"));
  if (!preferred) throw new Error("判题服务没有可用的 C++ 编译器");
  return preferred.id;
}

async function submit(sourceCode: string, test: TestCase, languageId: number) {
  const create = await fetch(`${JUDGE0_BASE}/submissions?base64_encoded=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      language_id: languageId,
      source_code: encode(sourceCode),
      stdin: encode(test.input),
      expected_output: encode(test.output),
      cpu_time_limit: CPU_TIME_LIMIT_SECONDS,
      wall_time_limit: WALL_TIME_LIMIT_SECONDS,
      memory_limit: MEMORY_LIMIT_KB,
    }),
  });
  const created = await create.json() as { token?: string; error?: string };
  if (!create.ok || !created.token) throw new Error(created.error || "C++ 提交进入队列失败");

  let result: JudgeResult | null = null;
  for (let attempt = 0; attempt < JUDGE_MAX_POLLS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? JUDGE_FIRST_POLL_MS : JUDGE_POLL_INTERVAL_MS));
    const response = await fetch(`${JUDGE0_BASE}/submissions/${created.token}?base64_encoded=true&fields=stdout,stderr,compile_output,message,time,status`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("读取 C++ 运行结果失败");
    result = await response.json() as JudgeResult;
    if (result.status.id > 2) break;
  }
  if (!result || result.status.id <= 2) throw new Error("C++ 判题超时，请稍后重试");

  const actual = decode(result.stdout).trim();
  const diagnostic = decode(result.compile_output) || decode(result.stderr) || decode(result.message);
  const status = result.status.id === 3 ? "AC" : result.status.id === 4 ? "WA" : result.status.id === 5 ? "TLE" : result.status.id === 6 ? "CE" : "RE";
  return {
    id: test.id,
    status,
    actual: diagnostic.trim() || actual,
    expected: test.output,
    duration: Math.max(1, Math.round(Number(result.time || 0) * 1000)),
  };
}

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, "judge");
  if (!rl.allowed) return NextResponse.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 });

  try {
    const { sourceCode, tests } = await request.json() as { sourceCode?: string; tests?: TestCase[] };
    if (typeof sourceCode !== "string" || !sourceCode.trim()) return NextResponse.json({ error: "C++ 源码不能为空" }, { status: 400 });
    if (!Array.isArray(tests) || tests.length === 0) return NextResponse.json({ error: "至少需要一个测试点" }, { status: 400 });
    if (tests.length > MAX_TESTS_PER_RUN) return NextResponse.json({ error: `单次最多运行 ${MAX_TESTS_PER_RUN} 个测试点` }, { status: 400 });
    if (sourceCode.length > MAX_SOURCE_LENGTH) return NextResponse.json({ error: `C++ 源码不能超过 ${MAX_SOURCE_LENGTH / 1000} KB` }, { status: 400 });
    if (tests.some((test) => typeof test.input !== "string" || typeof test.output !== "string" || test.input.length > MAX_SINGLE_TEST_LENGTH || test.output.length > MAX_SINGLE_TEST_LENGTH)) return NextResponse.json({ error: `单个测试点不能超过 ${MAX_SINGLE_TEST_LENGTH / 1000} KB` }, { status: 400 });
    if (tests.reduce((sum, test) => sum + test.input.length + test.output.length, 0) > MAX_TOTAL_TEST_LENGTH) return NextResponse.json({ error: `本次测试数据总量不能超过 ${MAX_TOTAL_TEST_LENGTH / 1_000_000} MB` }, { status: 400 });
    const languageId = await getCppLanguageId();
    const results = new Array(tests.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(JUDGE_CONCURRENCY, tests.length) }, async () => {
      while (cursor < tests.length) {
        const index = cursor++;
        results[index] = await submit(sourceCode, tests[index], languageId);
      }
    }));
    return NextResponse.json({ results, compiler: "GNU C++17 compatible" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "C++ 判题服务异常" }, { status: 502 });
  }
}
