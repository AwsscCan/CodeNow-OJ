type Sample = { input: string; output: string };

export type OutboundProblemContext = {
  id: string;
  title: string;
  description: string;
  inputFormat: string;
  outputFormat: string;
  samples: Sample[];
};

type Options = {
  loadOfficialSamples?: (problemId: string) => Promise<Sample[]>;
};

type AssetFetcher = {
  fetch(request: Request): Promise<Response>;
};

export const OUTBOUND_PROBLEM_CONTEXT_LIMITS = {
  id: 128,
  title: 240,
  description: 24_000,
  inputFormat: 4_000,
  outputFormat: 4_000,
  samples: 2,
  sampleField: 4_000,
} as const;

const UNSAFE_TEXT_CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/g;

const BUILTIN_OFFICIAL_SAMPLES: Record<string, Sample[]> = {
  P1001: [
    { input: "1 2", output: "3" },
    { input: "100 -27", output: "73" },
    { input: "999999 1", output: "1000000" },
  ],
};

export function createStaticAssetDocumentLoader(assets: AssetFetcher) {
  return async function loadDocument(problemId: string): Promise<unknown | null> {
    if (!/^[A-Za-z0-9_-]+$/.test(problemId)) return null;
    try {
      const response = await assets.fetch(new Request(`https://assets.invalid/problems/${encodeURIComponent(problemId)}.json`));
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  };
}

export function createServerKnownOfficialSampleLoader(loadDocument: (problemId: string) => Promise<unknown>) {
  return async function loadOfficialSamples(problemId: string): Promise<Sample[]> {
    const builtin = BUILTIN_OFFICIAL_SAMPLES[problemId];
    if (builtin) return normalizeSamples(builtin);

    const document = await loadDocument(problemId);
    if (!document || typeof document !== "object") return [];
    const samples = (document as Record<string, unknown>).samples;
    if (!Array.isArray(samples)) return [];
    return samples.flatMap((item) => {
      if (!item || typeof item !== "object" || (item as Record<string, unknown>).category !== "sample") return [];
      const candidate = sample(item);
      return candidate ? [candidate] : [];
    });
  };
}

type CloudflareRuntime = {
  env?: { ASSETS?: AssetFetcher };
};

async function loadServerKnownAssetDocument(problemId: string): Promise<unknown | null> {
  try {
    const moduleName = "cloudflare:workers";
    const runtime = await import(/* @vite-ignore */ moduleName) as CloudflareRuntime;
    const assets = runtime.env?.ASSETS;
    return assets ? createStaticAssetDocumentLoader(assets)(problemId) : null;
  } catch {
    return null;
  }
}

const loadServerKnownOfficialSamples = createServerKnownOfficialSampleLoader(loadServerKnownAssetDocument);

function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.replace(UNSAFE_TEXT_CONTROL, " ").slice(0, limit) : "";
}

function sample(value: unknown): Sample | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.input !== "string" || typeof item.output !== "string") return null;
  if (item.input.length > OUTBOUND_PROBLEM_CONTEXT_LIMITS.sampleField || item.output.length > OUTBOUND_PROBLEM_CONTEXT_LIMITS.sampleField) return null;
  const input = text(item.input, OUTBOUND_PROBLEM_CONTEXT_LIMITS.sampleField);
  const output = text(item.output, OUTBOUND_PROBLEM_CONTEXT_LIMITS.sampleField);
  return input && output ? { input, output } : null;
}

function normalizeSamples(value: unknown): Sample[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
      const candidate = sample(item);
      return candidate ? [candidate] : [];
    })
    : [];
}

function hasOnlyOfficialOrLegacyOrigin(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  for (const field of ["origin", "provenance"]) {
    const signal = item[field];
    if (signal !== undefined && (typeof signal !== "string" || signal.toLowerCase() !== "official")) return false;
  }
  const category = item.category;
  return typeof category !== "string" || !/(generated|runner|judge|counterexample|private)/i.test(category);
}

function sampleKey(sample: Sample) {
  return JSON.stringify([sample.input, sample.output]);
}

export async function buildOutboundProblemContext(problem: unknown, options: Options = {}): Promise<OutboundProblemContext> {
  const item = problem && typeof problem === "object" ? problem as Record<string, unknown> : {};
  const id = text(item.id, OUTBOUND_PROBLEM_CONTEXT_LIMITS.id);
  let official: Sample[] = [];
  try {
    const loaded = options.loadOfficialSamples ? await options.loadOfficialSamples(id) : await loadServerKnownOfficialSamples(id);
    official = normalizeSamples(loaded);
  } catch {
    official = [];
  }
  const officialKeys = new Set(official.map(sampleKey));
  const samples = Array.isArray(item.samples)
    ? item.samples.flatMap((item) => {
      const candidate = sample(item);
      return candidate && hasOnlyOfficialOrLegacyOrigin(item) && officialKeys.has(sampleKey(candidate)) ? [candidate] : [];
    }).slice(0, OUTBOUND_PROBLEM_CONTEXT_LIMITS.samples)
    : [];

  return {
    id,
    title: text(item.title, OUTBOUND_PROBLEM_CONTEXT_LIMITS.title),
    description: text(item.description, OUTBOUND_PROBLEM_CONTEXT_LIMITS.description),
    inputFormat: text(item.inputFormat, OUTBOUND_PROBLEM_CONTEXT_LIMITS.inputFormat),
    outputFormat: text(item.outputFormat, OUTBOUND_PROBLEM_CONTEXT_LIMITS.outputFormat),
    samples,
  };
}

export function serializeOutboundProblemContext(context: OutboundProblemContext): string {
  return JSON.stringify({
    id: text(context.id, OUTBOUND_PROBLEM_CONTEXT_LIMITS.id),
    title: text(context.title, OUTBOUND_PROBLEM_CONTEXT_LIMITS.title),
    description: text(context.description, OUTBOUND_PROBLEM_CONTEXT_LIMITS.description),
    inputFormat: text(context.inputFormat, OUTBOUND_PROBLEM_CONTEXT_LIMITS.inputFormat),
    outputFormat: text(context.outputFormat, OUTBOUND_PROBLEM_CONTEXT_LIMITS.outputFormat),
    samples: normalizeSamples(context.samples).slice(0, OUTBOUND_PROBLEM_CONTEXT_LIMITS.samples),
  });
}
