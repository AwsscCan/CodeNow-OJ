const MAX_TEST_FIELD_BYTES = 512 * 1024;
const MAX_PROBLEM_TEST_BYTES = 20 * 1024 * 1024;
const encoder = new TextEncoder();

export type ProblemInput = {
  problemCode: string;
  title: string;
  difficulty: string;
  timeLimit: string;
  memoryLimit: string;
  description: string;
  inputFormat: string;
  outputFormat: string;
  folderId?: string | null;
  origin?: string;
  sourceUrl?: string | null;
  extractionStatus?: string | null;
};

export type TestCaseInput = {
  input: string;
  expectedOutput: string;
  category?: string | null;
  scale?: number | null;
  targets?: string | null;
  reason?: string | null;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; field: string; message: string };

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false as const, code: "INVALID_PROBLEM", field, message: `${field} is required` };
  }
  return { ok: true as const, value: value.trim() };
}

export function validateProblem(input: unknown): ValidationResult<ProblemInput> {
  if (!input || typeof input !== "object") {
    return { ok: false, code: "INVALID_PROBLEM", field: "body", message: "Problem payload is required" };
  }
  const data = input as Record<string, unknown>;
  const fields = ["problemCode", "title", "difficulty", "timeLimit", "memoryLimit", "description", "inputFormat", "outputFormat"] as const;
  const normalized = {} as Record<(typeof fields)[number], string>;
  for (const field of fields) {
    const result = requiredString(data[field], field);
    if (!result.ok) return result;
    normalized[field] = result.value;
  }
  return {
    ok: true,
    value: {
      ...normalized,
      folderId: typeof data.folderId === "string" ? data.folderId : null,
      origin: typeof data.origin === "string" && data.origin.trim() ? data.origin.trim() : "private",
      sourceUrl: typeof data.sourceUrl === "string" ? data.sourceUrl : null,
      extractionStatus: typeof data.extractionStatus === "string" ? data.extractionStatus : null,
    },
  };
}

export function validateTestCases(input: unknown): ValidationResult<TestCaseInput[]> {
  if (!Array.isArray(input)) {
    return { ok: false, code: "INVALID_TEST_CASES", field: "testCases", message: "Test cases must be an array" };
  }
  let totalBytes = 0;
  const value: TestCaseInput[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const item = input[index];
    if (!item || typeof item !== "object") {
      return { ok: false, code: "INVALID_TEST_CASE", field: `testCases.${index}`, message: "Invalid test case" };
    }
    const data = item as Record<string, unknown>;
    if (typeof data.input !== "string" || typeof data.expectedOutput !== "string") {
      return { ok: false, code: "INVALID_TEST_CASE", field: `testCases.${index}`, message: "Input and expected output must be strings" };
    }
    const inputBytes = encoder.encode(data.input).byteLength;
    const outputBytes = encoder.encode(data.expectedOutput).byteLength;
    if (inputBytes > MAX_TEST_FIELD_BYTES || outputBytes > MAX_TEST_FIELD_BYTES) {
      return { ok: false, code: "TEST_CASE_TOO_LARGE", field: `testCases.${index}`, message: "Each input and output is limited to 512 KiB" };
    }
    totalBytes += inputBytes + outputBytes;
    if (totalBytes > MAX_PROBLEM_TEST_BYTES) {
      return { ok: false, code: "PROBLEM_TEST_DATA_TOO_LARGE", field: "testCases", message: "Test data is limited to 20 MiB per problem" };
    }
    value.push({
      input: data.input,
      expectedOutput: data.expectedOutput,
      category: typeof data.category === "string" ? data.category : null,
      scale: typeof data.scale === "number" && Number.isFinite(data.scale) ? Math.trunc(data.scale) : null,
      targets: typeof data.targets === "string" ? data.targets : null,
      reason: typeof data.reason === "string" ? data.reason : null,
    });
  }
  return { ok: true, value };
}

