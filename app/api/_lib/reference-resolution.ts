import {
  generateReferenceCandidate,
  getCachedReference,
  setCachedReference,
  staticCheck,
  validateReference,
  type ReferenceCandidate,
  type ValidatedReference,
} from "./reference-solution";
import type { AiWireApi } from "../../server/ai/ai-settings-repository";

export type ReferenceResolutionDependencies = {
  getCachedReference: (problemDigest: string) => ValidatedReference | null;
  setCachedReference: (problemDigest: string, reference: ValidatedReference) => void | Promise<void>;
  generateReferenceCandidate: (
    apiKey: string,
    endpoint: string,
    model: string,
    problemDigest: string,
    existingSamples: Array<{ input: string; output: string }>,
    signal?: AbortSignal,
    wireApi?: AiWireApi,
  ) => Promise<ReferenceCandidate>;
  validateReference: (
    candidate: ReferenceCandidate,
    samples: Array<{ input: string; output: string }>,
    differentialRounds: number,
    signal?: AbortSignal,
  ) => Promise<{ report: { status: string; errors: string[] }; validated?: ValidatedReference }>;
};

const defaultDependencies: ReferenceResolutionDependencies = {
  getCachedReference,
  setCachedReference,
  generateReferenceCandidate,
  validateReference,
};

function safeMessage(error: unknown, apiKey: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  const redacted = apiKey ? raw.replaceAll(apiKey, "[REDACTED]") : raw;
  return redacted.replace(/\s+/g, " ").trim().slice(0, 500);
}

function abortReason(signal: AbortSignal): unknown {
  const reason = signal.reason;
  if (reason && typeof reason === "object" && "name" in reason && String((reason as { name?: unknown }).name) === "AbortError") {
    return reason;
  }
  return new DOMException("The operation was aborted.", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

const REFERENCE_CACHE_MAX_AGE_MS = 30 * 60 * 1000;

function usableCachedReference(reference: ValidatedReference | null): reference is ValidatedReference {
  return Boolean(
    reference
    && reference.report?.status === "validated"
    && typeof reference.solutionCode === "string"
    && typeof reference.bruteCode === "string"
    && reference.solutionCode.trim()
    && reference.bruteCode.trim()
    && !staticCheck(reference.solutionCode)
    && !staticCheck(reference.bruteCode),
  );
}

function expiredReference(reference: ValidatedReference): boolean {
  if (!reference.report.validatedAt) return false;
  const validatedAt = Date.parse(reference.report.validatedAt);
  return !Number.isFinite(validatedAt) || Date.now() - validatedAt > REFERENCE_CACHE_MAX_AGE_MS;
}

function staleFallback(reference: ValidatedReference) {
  return {
    validatedRef: reference,
    status: { ok: true, cached: true, message: "Using stale validated reference solution after refresh failed." },
  };
}

export async function resolveValidatedReference(options: {
  apiKey: string;
  endpoint: string;
  model: string;
  problemDigest: string;
  samples: Array<{ input: string; output: string }>;
  wireApi?: AiWireApi;
  signal?: AbortSignal;
}, dependencies: ReferenceResolutionDependencies = defaultDependencies): Promise<{
  validatedRef?: ValidatedReference;
  status: { ok: boolean; cached: boolean; message: string };
}> {
  throwIfAborted(options.signal);
  let cached: ValidatedReference | null = null;
  try {
    const candidate = dependencies.getCachedReference(options.problemDigest);
    if (usableCachedReference(candidate)) cached = candidate;
  } catch {
    cached = null;
  }
  const stale = cached && expiredReference(cached) ? cached : undefined;
  if (cached && !stale) {
    return {
      validatedRef: cached,
      status: { ok: true, cached: true, message: "Using cached validated reference solution." },
    };
  }

  try {
    throwIfAborted(options.signal);
    const samples = options.samples.slice(0, 6);
    const candidate = await dependencies.generateReferenceCandidate(
      options.apiKey,
      options.endpoint,
      options.model,
      options.problemDigest,
      samples,
      options.signal,
      options.wireApi,
    );
    throwIfAborted(options.signal);
    const rounds = Math.min(8, Math.max(4, candidate.validationInputs.length));
    const validation = options.signal
      ? await dependencies.validateReference(candidate, samples, rounds, options.signal)
      : await dependencies.validateReference(candidate, samples, rounds);
    throwIfAborted(options.signal);
    if (!validation.validated) {
      const detail = validation.report.errors?.[0] || `reference validation ${validation.report.status}`;
      if (stale) return staleFallback(stale);
      return { status: { ok: false, cached: false, message: detail } };
    }
    if (!usableCachedReference(validation.validated)) {
      if (stale) return staleFallback(stale);
      return { status: { ok: false, cached: false, message: "reference validation returned an invalid artifact" } };
    }
    try {
      throwIfAborted(options.signal);
      await dependencies.setCachedReference(options.problemDigest, validation.validated);
      throwIfAborted(options.signal);
    } catch {
      if (options.signal?.aborted) throw abortReason(options.signal);
      return {
        validatedRef: validation.validated,
        status: { ok: true, cached: false, message: "Validated reference solution; cache write failed, continuing without cache." },
      };
    }
    return {
      validatedRef: validation.validated,
      status: { ok: true, cached: false, message: "Validated and cached reference solution." },
    };
  } catch (error) {
    if (options.signal?.aborted) throw abortReason(options.signal);
    if (stale) return staleFallback(stale);
    return { status: { ok: false, cached: false, message: safeMessage(error, options.apiKey) } };
  }
}
