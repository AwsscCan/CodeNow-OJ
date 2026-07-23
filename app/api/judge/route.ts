import { NextRequest, NextResponse } from "next/server";

const JUDGE0_BASE = "https://ce.judge0.com";
const MAX_TESTS = 24;

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

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

function decode(value?: string | null) {
  if (!value) return "";
  return Buffer.from(value, "base64").toString("utf8");
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
      cpu_time_limit: 3,
      wall_time_limit: 6,
      memory_limit: 262144,
    }),
  });
  const created = await create.json() as { token?: string; error?: string };
  if (!create.ok || !created.token) throw new Error(created.error || "C++ 提交进入队列失败");

  let result: JudgeResult | null = null;
  for (let attempt = 0; attempt < 14; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 300 : 550));
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
  try {
    const { sourceCode, tests } = await request.json() as { sourceCode?: string; tests?: TestCase[] };
    if (typeof sourceCode !== "string" || !sourceCode.trim()) return NextResponse.json({ error: "C++ 源码不能为空" }, { status: 400 });
    if (!Array.isArray(tests) || tests.length === 0) return NextResponse.json({ error: "至少需要一个测试点" }, { status: 400 });
    if (tests.length > MAX_TESTS) return NextResponse.json({ error: `单次最多运行 ${MAX_TESTS} 个测试点` }, { status: 400 });
    if (sourceCode.length > 100_000) return NextResponse.json({ error: "C++ 源码不能超过 100 KB" }, { status: 400 });
    if (tests.some((test) => typeof test.input !== "string" || typeof test.output !== "string" || test.input.length > 300_000 || test.output.length > 300_000)) return NextResponse.json({ error: "单个测试点不能超过 300 KB" }, { status: 400 });
    if (tests.reduce((sum, test) => sum + test.input.length + test.output.length, 0) > 2_000_000) return NextResponse.json({ error: "本次测试数据总量不能超过 2 MB" }, { status: 400 });
    const languageId = await getCppLanguageId();
    const results = new Array(tests.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, tests.length) }, async () => {
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
