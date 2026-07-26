// Judge0-based verification of AI-generated test cases.
// Runs a reference solution against each test input and compares actual output with AI's expected output.

import { CPU_TIME_LIMIT_SECONDS, WALL_TIME_LIMIT_SECONDS, MEMORY_LIMIT_KB } from "./constants";
import { decode, encode, getCppLanguageId, submitSingle } from "./judge0-client";

type VerifiableTest = { input: string; output: string; category?: string; scale?: number; targets?: string; reason?: string };
type VerifiedTest = VerifiableTest & { verified: boolean; actualOutput?: string };

const VERIFY_FIELDS = "stdout,stderr,compile_output,message,status";

async function runSingleTest(sourceCode: string, input: string, languageId: number): Promise<{ actual: string; error?: string }> {
  const result = await submitSingle({
    language_id: languageId,
    source_code: encode(sourceCode),
    stdin: encode(input),
    cpu_time_limit: CPU_TIME_LIMIT_SECONDS,
    wall_time_limit: WALL_TIME_LIMIT_SECONDS,
    memory_limit: MEMORY_LIMIT_KB,
  }, VERIFY_FIELDS);
  if (!result) throw new Error("验证判题超时");

  const id = result.status.id;
  if (id === 6) return { actual: "", error: decode(result.compile_output) || "参考解答编译错误" }; // Compile Error
  if (id === 5) return { actual: "", error: "参考解答在验证时超时" }; // TLE
  if (id !== 3 && id !== 4) return { actual: "", error: decode(result.compile_output) || decode(result.stderr) || decode(result.message) || "参考解答运行时错误" }; // Error/RE

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
