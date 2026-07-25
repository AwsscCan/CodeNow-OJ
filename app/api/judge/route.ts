import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "../_lib/rate-limit";
import {
  CPU_TIME_LIMIT_SECONDS,
  JUDGE0_BASE,
  JUDGE_CONCURRENCY,
  JUDGE_FIRST_POLL_MS,
  JUDGE_MAX_POLLS,
  JUDGE_POLL_INTERVAL_MS,
  MAX_SINGLE_TEST_LENGTH,
  MAX_SOURCE_LENGTH,
  MAX_TESTS_PER_RUN,
  MAX_TOTAL_TEST_LENGTH,
  MEMORY_LIMIT_KB,
  WALL_TIME_LIMIT_SECONDS,
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

let cachedCppLanguageId: number | null = null;

function encode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decode(value?: string | null): string {
  if (!value) return "";
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

async function getCppLanguageId() {
  if (cachedCppLanguageId !== null) return cachedCppLanguageId;
  const response = await fetch(`${JUDGE0_BASE}/languages`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Unable to read the C++ compiler list.");
  const languages = await response.json() as { id: number; name: string }[];
  const preferred = languages.find((item) => item.name.includes("C++ (GCC 14"))
    || languages.find((item) => item.name.includes("C++ (GCC 13"))
    || languages.find((item) => item.name.includes("C++ (GCC 12"))
    || languages.find((item) => item.name.includes("C++ (GCC 9"))
    || languages.find((item) => item.name.includes("C++"));
  if (!preferred) throw new Error("No available C++ compiler was found.");
  cachedCppLanguageId = preferred.id;
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
  if (!create.ok || !created.token) throw new Error(created.error || "Failed to enqueue C++ submission.");

  let result: JudgeResult | null = null;
  for (let attempt = 0; attempt < JUDGE_MAX_POLLS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? JUDGE_FIRST_POLL_MS : JUDGE_POLL_INTERVAL_MS));
    const response = await fetch(`${JUDGE0_BASE}/submissions/${created.token}?base64_encoded=true&fields=stdout,stderr,compile_output,message,time,status`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Failed to read C++ execution result.");
    result = await response.json() as JudgeResult;
    if (result.status.id > 2) break;
  }
  if (!result || result.status.id <= 2) throw new Error("C++ judge timed out. Please retry later.");

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
  if (!rl.allowed) return NextResponse.json({ error: "????????????" }, { status: 429 });

  try {
    const { sourceCode, tests } = await request.json() as { sourceCode?: string; tests?: TestCase[] };
    if (typeof sourceCode !== "string" || !sourceCode.trim()) return NextResponse.json({ error: "C++ ??????" }, { status: 400 });
    if (!Array.isArray(tests) || tests.length === 0) return NextResponse.json({ error: "?????????" }, { status: 400 });
    if (tests.length > MAX_TESTS_PER_RUN) return NextResponse.json({ error: `?????? ${MAX_TESTS_PER_RUN} ????` }, { status: 400 });
    if (sourceCode.length > MAX_SOURCE_LENGTH) return NextResponse.json({ error: `C++ ?????? ${MAX_SOURCE_LENGTH / 1000} KB` }, { status: 400 });
    if (tests.some((test) => typeof test.input !== "string" || typeof test.output !== "string" || test.input.length > MAX_SINGLE_TEST_LENGTH || test.output.length > MAX_SINGLE_TEST_LENGTH)) {
      return NextResponse.json({ error: `????????? ${MAX_SINGLE_TEST_LENGTH / 1000} KB` }, { status: 400 });
    }
    if (tests.reduce((sum, test) => sum + test.input.length + test.output.length, 0) > MAX_TOTAL_TEST_LENGTH) {
      return NextResponse.json({ error: `???????????? ${MAX_TOTAL_TEST_LENGTH / 1_000_000} MB` }, { status: 400 });
    }

    const languageId = await getCppLanguageId();
    const results = new Array(tests.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(JUDGE_CONCURRENCY, tests.length) }, async () => {
      while (cursor < tests.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await submit(sourceCode, tests[index], languageId);
      }
    }));
    return NextResponse.json({ results, compiler: "GNU C++17 compatible" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "C++ ??????" }, { status: 502 });
  }
}
