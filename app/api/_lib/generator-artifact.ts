import type { GeneratedTest } from "./complexity-tests";
import { MAX_EXPANDED_CHARS } from "./constants";
import { validateInput } from "./generator-registry";
import { staticCheck } from "./reference-solution";

export type GeneratorArtifact = {
  sourceCode: string;
  seeds: number[];
};

export type GeneratorRunResult = {
  accepted: boolean;
  stdout: string;
  compileError: string;
  statusId: number;
};

export type GeneratorRunner = (sourceCode: string, input: string, languageId: number) => Promise<GeneratorRunResult>;

async function mapConcurrent<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(items.length, concurrency) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }));
  return results;
}

function boundedSeeds(seeds: number[]): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of seeds) {
    if (!Number.isSafeInteger(value)) continue;
    const seed = value;
    if (seen.has(seed)) continue;
    seen.add(seed);
    result.push(seed);
    if (result.length >= 8) break;
  }
  return result;
}

function normalizeGeneratedInput(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n");
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

export async function executeGeneratorArtifact(options: {
  artifact: GeneratorArtifact;
  languageId: number;
  run: GeneratorRunner;
  concurrency?: number;
}): Promise<GeneratedTest[]> {
  const sourceCode = options.artifact?.sourceCode;
  if (typeof sourceCode !== "string" || !sourceCode.trim() || staticCheck(sourceCode)) return [];
  const seeds = boundedSeeds(options.artifact.seeds);
  if (!seeds.length) return [];
  const concurrency = Math.max(1, Math.min(8, Math.floor(options.concurrency ?? 6)));
  const results = await mapConcurrent(seeds, concurrency, async (seed) => {
    try {
      return await options.run(sourceCode, `${seed}\n`, options.languageId);
    } catch {
      return null;
    }
  });
  const generated: GeneratedTest[] = [];
  for (let index = 0; index < seeds.length; index += 1) {
    const result = results[index];
    if (!result || !result.accepted || result.compileError.trim()) continue;
    const input = normalizeGeneratedInput(result.stdout);
    if (validateInput(input, MAX_EXPANDED_CHARS)) continue;
    generated.push({
      input,
      output: "",
      category: "ordinary",
      scale: Math.max(1, Math.abs(seeds[index])),
      targets: `testlib generator seed ${seeds[index]}`,
      reason: "deterministic generator artifact",
    });
  }
  return generated;
}
