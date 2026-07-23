// Judge0-based verification of AI-generated test cases.
// Runs a reference solution against each test input and compares actual output with AI's expected output.

import { JUDGE0_BASE, CPU_TIME_LIMIT_SECONDS, WALL_TIME_LIMIT_SECONDS, MEMORY_LIMIT_KB, JUDGE_POLL_INTERVAL_MS, JUDGE_FIRST_POLL_MS, JUDGE_MAX_POLLS } from "./constants";

type VerifiableTest = { input: string; output: string; category?: string; scale?: number; targets?: string; reason?: string };
type VerifiedTest = VerifiableTest & { verified: boolean; actualOutput?: string };

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
  } catch { return ""; }
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

async function runSingleTest(sourceCode: string, input: string, languageId: number): Promise<{ actual: string; error?: string }> {
  const create = await fetch(`${JUDGE0_BASE}/submissions?base64_encoded=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      language_id: languageId,
      source_code: encode(sourceCode),
      stdin: encode(input),
      cpu_time_limit: CPU_TIME_LIMIT_SECONDS,
      wall_time_limit: WALL_TIME_LIMIT_SECONDS,
      memory_limit: MEMORY_LIMIT_KB,
    }),
  });
  const created = await create.json() as { token?: string; error?: string };
  if (!create.ok || !created.token) throw new Error(created.error || "验证提交失败");

  type JudgeResult = { stdout?: string | null; stderr?: string | null; compile_output?: string | null; message?: string | null; status: { id: number } };
  let result: JudgeResult | null = null;
  for (let attempt = 0; attempt < JUDGE_MAX_POLLS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? JUDGE_FIRST_POLL_MS : JUDGE_POLL_INTERVAL_MS));
    const response = await fetch(`${JUDGE0_BASE}/submissions/${created.token}?base64_encoded=true&fields=stdout,stderr,compile_output,message,status`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("读取验证结果失败");
    result = await response.json() as JudgeResult;
    if (result.status.id > 2) break;
  }
  if (!result || result.status.id <= 2) throw new Error("验证判题超时");

  if (result.status.id === 6) { // Compile Error
    return { actual: "", error: decode(result.compile_output) || "参考解答编译错误" };
  }
  if (result.status.id === 5) { // TLE
    return { actual: "", error: "参考解答在验证时超时" };
  }
  if (result.status.id !== 3 && result.status.id !== 4) { // Error/RE
    return { actual: "", error: decode(result.compile_output) || decode(result.stderr) || decode(result.message) || "参考解答运行时错误" };
  }

  return { actual: decode(result.stdout).trim() };
}

function normalizeOutput(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
}

/**
 * Verify AI-generated test cases by running a reference C++ solution through Judge0.
 * For each test, compares the reference solution's actual output with the AI's expected output.
 *
 * @returns Tests with `verified: true` for those where actual output matches expected.
 */
export async function verifyTests(
  tests: VerifiableTest[],
  referenceSolution: string,
): Promise<VerifiedTest[]> {
  if (!tests.length || !referenceSolution.trim()) {
    return tests.map((t) => ({ ...t, verified: false, actualOutput: undefined }));
  }

  let languageId: number;
  try {
    languageId = await getCppLanguageId();
  } catch {
    // Judge0 unavailable — skip verification, mark all unverified
    return tests.map((t) => ({ ...t, verified: false }));
  }

  const results: VerifiedTest[] = [];
  let cursor = 0;
  const concurrency = 3;

  await Promise.all(Array.from({ length: Math.min(concurrency, tests.length) }, async () => {
    while (cursor < tests.length) {
      const index = cursor++;
      const test = tests[index];
      try {
        const { actual, error } = await runSingleTest(referenceSolution, test.input, languageId);
        if (error) {
          // Reference solution failed — can't verify this test
          results[index] = { ...test, verified: false, actualOutput: error };
        } else {
          const matches = normalizeOutput(actual) === normalizeOutput(test.output);
          results[index] = { ...test, verified: matches, actualOutput: matches ? undefined : actual };
        }
      } catch {
        results[index] = { ...test, verified: false, actualOutput: "验证执行异常" };
      }
    }
  }));

  return results;
}

/**
 * Generate a reference solution using AI, then verify generated tests.
 * Returns only tests that passed verification (verified: true) or all if verification failed.
 */
export function filterVerifiedTests(tests: VerifiedTest[]): VerifiableTest[] {
  const verified = tests.filter((t) => t.verified);
  return verified.map(({ verified: _v, actualOutput: _a, ...rest }) => rest);
}
