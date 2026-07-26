import { NextRequest, NextResponse } from "next/server";
import {
  CPU_TIME_LIMIT_SECONDS,
  JUDGE_CONCURRENCY,
  MAX_SINGLE_TEST_LENGTH,
  MAX_SOURCE_LENGTH,
  MAX_TESTS_PER_RUN,
  MAX_TOTAL_TEST_LENGTH,
  MEMORY_LIMIT_KB,
  WALL_TIME_LIMIT_SECONDS,
} from "../_lib/constants";
import {
  BatchUnsupportedError,
  createBatch,
  decode,
  encode,
  getCppLanguageId,
  pollBatchUntilDone,
  submitSingle,
  type Judge0Result,
  type SubmissionPayload,
} from "../_lib/judge0-client";
import { rateLimit } from "../_lib/rate-limit";

type TestCase = { id: number; input: string; output: string };
type JudgeOutcome = { id: number; status: string; actual: string; expected: string; duration: number };

const POLL_FIELDS = "stdout,stderr,compile_output,message,time,status";

function toPayload(encodedSource: string, test: TestCase, languageId: number): SubmissionPayload {
  return {
    language_id: languageId,
    source_code: encodedSource,
    stdin: encode(test.input),
    expected_output: encode(test.output),
    cpu_time_limit: CPU_TIME_LIMIT_SECONDS,
    wall_time_limit: WALL_TIME_LIMIT_SECONDS,
    memory_limit: MEMORY_LIMIT_KB,
  };
}

function mapResult(test: TestCase, result: Judge0Result): JudgeOutcome {
  const actual = decode(result.stdout).trim();
  const diagnostic = decode(result.compile_output) || decode(result.stderr) || decode(result.message);
  const id = result.status.id;
  const status = id === 3 ? "AC" : id === 4 ? "WA" : id === 5 ? "TLE" : id === 6 ? "CE" : "RE";
  return {
    id: test.id,
    status,
    actual: diagnostic.trim() || actual,
    expected: test.output,
    duration: Math.max(1, Math.round(Number(result.time || 0) * 1000)),
  };
}

function failOutcome(test: TestCase, message: string): JudgeOutcome {
  return { id: test.id, status: "RE", actual: message, expected: test.output, duration: 1 };
}

// 主路径：一次批量创建 + 整批统一轮询，按 token 从结果 Map 回填，位置严格对齐 tests。
async function judgeViaBatch(encodedSource: string, tests: TestCase[], languageId: number): Promise<JudgeOutcome[]> {
  const created = await createBatch(tests.map((test) => toPayload(encodedSource, test, languageId)));
  const tokens = created.map((item) => item.token).filter((token): token is string => typeof token === "string");
  const resultMap = await pollBatchUntilDone(tokens, POLL_FIELDS);
  return tests.map((test, index) => {
    const token = created[index].token;
    if (!token) return failOutcome(test, "判题任务创建失败");
    const result = resultMap.get(token);
    if (!result) return failOutcome(test, "C++ 判题超时，请稍后重试");
    return mapResult(test, result);
  });
}

// 回退路径：batch 端点不可用时退化为逐点并发提交，复用同一轮询内核。
async function judgeViaSingle(encodedSource: string, tests: TestCase[], languageId: number): Promise<JudgeOutcome[]> {
  const outcomes = new Array<JudgeOutcome>(tests.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(JUDGE_CONCURRENCY, tests.length) }, async () => {
    while (cursor < tests.length) {
      const index = cursor;
      cursor += 1;
      const test = tests[index];
      try {
        const result = await submitSingle(toPayload(encodedSource, test, languageId), POLL_FIELDS);
        outcomes[index] = result ? mapResult(test, result) : failOutcome(test, "C++ 判题超时，请稍后重试");
      } catch (error) {
        outcomes[index] = failOutcome(test, error instanceof Error ? error.message : "判题执行异常");
      }
    }
  }));
  return outcomes;
}

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, "judge");
  if (!rl.allowed) return NextResponse.json({ error: "判题请求过于频繁，请稍后重试" }, { status: 429 });

  try {
    const { sourceCode, tests } = await request.json() as { sourceCode?: string; tests?: TestCase[] };
    if (typeof sourceCode !== "string" || !sourceCode.trim()) return NextResponse.json({ error: "C++ 源代码不能为空" }, { status: 400 });
    if (!Array.isArray(tests) || tests.length === 0) return NextResponse.json({ error: "至少需要一个测试点" }, { status: 400 });
    if (tests.length > MAX_TESTS_PER_RUN) return NextResponse.json({ error: `单次判题最多 ${MAX_TESTS_PER_RUN} 个测试点` }, { status: 400 });
    if (sourceCode.length > MAX_SOURCE_LENGTH) return NextResponse.json({ error: `C++ 源代码不能超过 ${MAX_SOURCE_LENGTH / 1000} KB` }, { status: 400 });
    if (tests.some((test) => typeof test.input !== "string" || typeof test.output !== "string" || test.input.length > MAX_SINGLE_TEST_LENGTH || test.output.length > MAX_SINGLE_TEST_LENGTH)) {
      return NextResponse.json({ error: `单个测试点数据不能超过 ${MAX_SINGLE_TEST_LENGTH / 1000} KB` }, { status: 400 });
    }
    if (tests.reduce((sum, test) => sum + test.input.length + test.output.length, 0) > MAX_TOTAL_TEST_LENGTH) {
      return NextResponse.json({ error: `测试点数据总量不能超过 ${MAX_TOTAL_TEST_LENGTH / 1_000_000} MB` }, { status: 400 });
    }

    const languageId = await getCppLanguageId();
    const encodedSource = encode(sourceCode);

    let results: JudgeOutcome[];
    try {
      results = await judgeViaBatch(encodedSource, tests, languageId);
    } catch (error) {
      if (error instanceof BatchUnsupportedError) results = await judgeViaSingle(encodedSource, tests, languageId);
      else throw error;
    }

    return NextResponse.json({ results, compiler: "GNU C++17 compatible" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "C++ 判题服务暂时不可用" }, { status: 502 });
  }
}
