import { describe, expect, it, vi } from "vitest";
import { resolveValidatedReference } from "../../app/api/_lib/reference-resolution";
import type { ReferenceCandidate, ValidatedReference, ValidationReport } from "../../app/api/_lib/reference-solution";

function candidate(): ReferenceCandidate {
  return {
    solutionCode: "solution",
    bruteCode: "brute",
    expectedTimeComplexity: "O(n)",
    expectedSpaceComplexity: "O(1)",
    bruteMaxScale: 10,
    algorithmSummary: "sum",
    assumptions: [],
    validationInputs: ["1", "2", "3", "4"],
    mutants: [{ id: "m1", sourceCode: "mutant" }],
  };
}

function report(status: ValidationReport["status"]): ValidationReport {
  return { status, compiled: status === "validated", samplesPassed: status === "validated", differentialTestsPassed: 4, differentialTestsFailed: 0, errors: [] };
}

function validated(): ValidatedReference {
  return { ...candidate(), report: report("validated") };
}

describe("validated reference resolution", () => {
  it("returns a cached reference without generating or validating again", async () => {
    const cached = validated();
    const generate = vi.fn();
    const validate = vi.fn();

    const result = await resolveValidatedReference({
      apiKey: "key", endpoint: "https://example.com", model: "model", problemDigest: "P", samples: [],
    }, {
      getCachedReference: () => cached,
      setCachedReference: vi.fn(),
      generateReferenceCandidate: generate,
      validateReference: validate,
    });

    expect(result).toEqual({ validatedRef: cached, status: { ok: true, cached: true, message: "Using cached validated reference solution." } });
    expect(generate).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
  });

  it("validates and caches a newly generated reference", async () => {
    const saved = vi.fn();
    const fresh = validated();
    const validate = vi.fn(async () => ({ report: report("validated"), validated: fresh }));

    const result = await resolveValidatedReference({
      apiKey: "key", endpoint: "https://example.com", model: "model", problemDigest: "P", samples: [{ input: "1", output: "1" }],
    }, {
      getCachedReference: () => null,
      setCachedReference: saved,
      generateReferenceCandidate: vi.fn(async () => candidate()),
      validateReference: validate,
    });

    expect(result).toMatchObject({ validatedRef: fresh, status: { ok: true, cached: false } });
    expect(saved).toHaveBeenCalledWith("P", fresh);
    expect(validate).toHaveBeenCalledWith(expect.objectContaining({ mutants: [{ id: "m1", sourceCode: "mutant" }] }), [{ input: "1", output: "1" }], 4);
  });

  it("cancels an in-flight resolution before it can write a late reference to cache", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("client disconnected", "AbortError");
    let releaseCandidate!: () => void;
    let receivedSignal: AbortSignal | undefined;
    const saved = vi.fn();
    const generate = vi.fn((...args: unknown[]) => new Promise<ReferenceCandidate>((resolve, reject) => {
      receivedSignal = args[5] as AbortSignal | undefined;
      const onAbort = () => reject(receivedSignal?.reason || abortError);
      receivedSignal?.addEventListener("abort", onAbort, { once: true });
      releaseCandidate = () => resolve(candidate());
    }));
    const resolution = resolveValidatedReference({
      apiKey: "key", endpoint: "https://example.com", model: "model", problemDigest: "cancel-me", samples: [], signal: controller.signal,
    }, {
      getCachedReference: () => null,
      setCachedReference: saved,
      generateReferenceCandidate: generate,
      validateReference: vi.fn(async () => ({ report: report("validated"), validated: validated() })),
    });

    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    try {
      controller.abort(abortError);
      const outcome = await Promise.race([
        resolution.then(
          () => ({ kind: "resolved" as const }),
          (error) => ({ kind: "error" as const, error }),
        ),
        new Promise<{ kind: "timeout" }>((resolve) => setTimeout(() => resolve({ kind: "timeout" }), 40)),
      ]);

      expect(outcome).toMatchObject({ kind: "error", error: { name: "AbortError", message: "client disconnected" } });
      expect(receivedSignal?.aborted).toBe(true);
      expect(saved).not.toHaveBeenCalled();
    } finally {
      releaseCandidate();
      await resolution.catch(() => undefined);
    }
  });

  it("returns a non-throwing failure status when reference construction fails", async () => {
    const result = await resolveValidatedReference({
      apiKey: "key", endpoint: "https://example.com", model: "model", problemDigest: "P", samples: [],
    }, {
      getCachedReference: () => null,
      setCachedReference: vi.fn(),
      generateReferenceCandidate: vi.fn(async () => { throw new Error("upstream unavailable"); }),
      validateReference: vi.fn(),
    });

    expect(result.validatedRef).toBeUndefined();
    expect(result.status).toMatchObject({ ok: false, cached: false });
    expect(result.status.message).toContain("upstream unavailable");
  });

  it("does not cache a candidate rejected by validation", async () => {
    const saved = vi.fn();
    const result = await resolveValidatedReference({
      apiKey: "key", endpoint: "https://example.com", model: "model", problemDigest: "P", samples: [],
    }, {
      getCachedReference: () => null,
      setCachedReference: saved,
      generateReferenceCandidate: vi.fn(async () => candidate()),
      validateReference: vi.fn(async () => ({ report: { ...report("differential_failed"), errors: ["solution/brute mismatch"] } })),
    });

    expect(result.validatedRef).toBeUndefined();
    expect(result.status.message).toContain("solution/brute mismatch");
    expect(saved).not.toHaveBeenCalled();
  });

  it("continues with a fresh validated reference when cache reads fail", async () => {
    const fresh = validated();
    const generate = vi.fn(async () => candidate());

    const result = await resolveValidatedReference({
      apiKey: "key", endpoint: "https://example.com", model: "model", problemDigest: "P", samples: [],
    }, {
      getCachedReference: () => { throw new Error("cache unavailable"); },
      setCachedReference: vi.fn(),
      generateReferenceCandidate: generate,
      validateReference: vi.fn(async () => ({ report: report("validated"), validated: fresh })),
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ validatedRef: fresh, status: { ok: true, cached: false } });
  });

  it("keeps a fresh reference usable when only the cache write fails", async () => {
    const fresh = validated();

    const result = await resolveValidatedReference({
      apiKey: "key", endpoint: "https://example.com", model: "model", problemDigest: "P", samples: [],
    }, {
      getCachedReference: () => null,
      setCachedReference: () => { throw new Error("cache unavailable"); },
      generateReferenceCandidate: vi.fn(async () => candidate()),
      validateReference: vi.fn(async () => ({ report: report("validated"), validated: fresh })),
    });

    expect(result).toMatchObject({ validatedRef: fresh, status: { ok: true, cached: false } });
    expect(result.status.message).toContain("cache");
  });

  it("refreshes an expired cache entry and falls back to it when refresh fails", async () => {
    const stale = {
      ...validated(),
      report: {
        ...report("validated"),
        validatedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
      },
    };
    const generate = vi.fn(async () => { throw new Error("upstream unavailable"); });

    const result = await resolveValidatedReference({
      apiKey: "key", endpoint: "https://example.com", model: "model", problemDigest: "P", samples: [],
    }, {
      getCachedReference: () => stale,
      setCachedReference: vi.fn(),
      generateReferenceCandidate: generate,
      validateReference: vi.fn(),
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ validatedRef: stale, status: { ok: true, cached: true } });
    expect(result.status.message).toContain("stale");
  });
});
