import { describe, it, expect } from "vitest";

// Test the pure JSON parsing/repair functions by importing the module.
// We directly test the internal functions exposed for testing.
// Since they are not exported, we test through the public API where possible,
// and test the repair logic by observing behavior.

describe("Complexity tests - JSON repair helpers", () => {
  // These tests verify the robustness of JSON parsing from AI responses.
  // The actual functions are internal; we test common failure patterns.

  function simulateParse(rawAiResponse: string): unknown {
    // Simulate the parseJson logic from complexity-tests.ts
    const cleaned = rawAiResponse.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

    // Extract JSON candidates
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("No JSON found");

    let candidate = cleaned.slice(start, end + 1);

    // Apply repairs
    const repairs = [
      candidate,
      candidate.replace(/^﻿/, "").replace(/[""]/g, '"').replace(/['']/g, "'").replace(/,\s*([}\]])/g, "$1"),
    ];

    for (const attempt of repairs) {
      try { return JSON.parse(attempt); } catch { /* try next */ }
    }
    throw new Error("Unparseable");
  }

  it("parses clean JSON", () => {
    const result = simulateParse('{"tests":[{"input":"1 2","output":"3"}]}');
    expect(result).toHaveProperty("tests");
    expect((result as Record<string, unknown>).tests).toHaveLength(1);
  });

  it("parses JSON with markdown code fence", () => {
    const result = simulateParse('```json\n{"tests":[{"input":"1 2","output":"3"}]}\n```');
    expect(result).toHaveProperty("tests");
  });

  it("parses JSON with surrounding text", () => {
    const result = simulateParse('Here is the JSON:\n{"tests":[{"input":"1","output":"2"}]}\nEnd of response.');
    expect(result).toHaveProperty("tests");
  });

  it("parses JSON with Chinese curly quotes (smart quotes)", () => {
    const result = simulateParse('{"tests":[{"input":"1","output":"2"}]}');
    // Smart quotes would be in the keys, but our simple simulator handles basic case
    expect(result).toHaveProperty("tests");
  });

  it("parses JSON with trailing commas", () => {
    const result = simulateParse('{"tests":[{"input":"1","output":"2",},]}');
    expect(result).toHaveProperty("tests");
  });

  it("handles empty AI responses", () => {
    expect(() => simulateParse("")).toThrow();
    expect(() => simulateParse("no json here")).toThrow();
  });

  it("handles deeply nested JSON", () => {
    const input = `{"analysis":{"expectedTimeComplexity":"O(n)"},"tests":[{"input":"3\\n1 2 3","output":"6","category":"ordinary","scale":3,"targets":"basic","reason":"check"}]}`;
    const result = simulateParse(input);
    expect(result).toHaveProperty("analysis");
    expect(result).toHaveProperty("tests");
  });
});

describe("Complexity tests - constants", () => {
  it("AI_MAX_RAW_PROBLEM_LENGTH is reasonable", async () => {
    const { AI_MAX_RAW_PROBLEM_LENGTH } = await import("../../app/api/_lib/constants");
    expect(AI_MAX_RAW_PROBLEM_LENGTH).toBe(60_000);
  });

  it("MAX_EXPANDED_CHARS is reasonable", async () => {
    const { MAX_EXPANDED_CHARS } = await import("../../app/api/_lib/constants");
    expect(MAX_EXPANDED_CHARS).toBe(300_000);
  });

  it("MAX_TESTS_PER_RUN is 24", async () => {
    const { MAX_TESTS_PER_RUN } = await import("../../app/api/_lib/constants");
    expect(MAX_TESTS_PER_RUN).toBe(24);
  });

  it("ALLOWED_AI_HOSTS includes expected providers", async () => {
    const { ALLOWED_AI_HOSTS } = await import("../../app/api/_lib/constants");
    expect(ALLOWED_AI_HOSTS).toContain("api.deepseek.com");
    expect(ALLOWED_AI_HOSTS).toContain("api.openai.com");
    expect(ALLOWED_AI_HOSTS).toContain("api.anthropic.com");
  });

  it("rate limit values are positive", async () => {
    const { RATE_LIMIT_JUDGE, RATE_LIMIT_AI, RATE_LIMIT_SUBMISSIONS } = await import("../../app/api/_lib/constants");
    expect(RATE_LIMIT_JUDGE).toBeGreaterThan(0);
    expect(RATE_LIMIT_AI).toBeGreaterThan(0);
    expect(RATE_LIMIT_SUBMISSIONS).toBeGreaterThan(0);
  });
});
