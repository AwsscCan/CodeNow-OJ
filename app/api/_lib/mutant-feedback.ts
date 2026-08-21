import type { GeneratedTest } from "./complexity-tests";
import { staticCheck } from "./reference-solution";
import type { CandidateMutationResult } from "./test-quality-selection";

export type MutantSource = { id: string; sourceCode: string };

export type MutantRunResult = {
  accepted: boolean;
  stdout: string;
  compileError: string;
  statusId: number;
};

export type MutantRunner = (sourceCode: string, input: string, languageId: number) => Promise<MutantRunResult>;

async function mapConcurrent<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let aborted = false;
  await Promise.all(Array.from({ length: Math.min(items.length, concurrency) }, async () => {
    while (!aborted && cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        aborted = true;
        throw error;
      }
    }
  }));
  return results;
}

function normalizeOutput(value: string): string {
  const lines = value.replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/[ \t]+$/g, ""));
  while (lines.length && !lines.at(-1)) lines.pop();
  return lines.join("\n");
}

function boundedMutants(mutants: MutantSource[]): MutantSource[] {
  const ids = new Set<string>();
  const sources = new Set<string>();
  const result: MutantSource[] = [];
  for (const mutant of mutants) {
    const id = mutant.id.trim();
    const sourceCode = mutant.sourceCode.trim();
    if (!id || !sourceCode || ids.has(id) || sources.has(sourceCode)) continue;
    ids.add(id);
    sources.add(sourceCode);
    result.push({ id, sourceCode });
    if (result.length === 8) break;
  }
  return result;
}

function boundedConcurrency(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 6;
  return Math.max(1, Math.min(8, Math.floor(value)));
}

function isRunnableCandidate(candidate: unknown): candidate is GeneratedTest {
  if (typeof candidate !== "object" || candidate === null) return false;
  const value = candidate as { input?: unknown; output?: unknown };
  return typeof value.input === "string" && typeof value.output === "string";
}

function boundedCandidates(candidates: GeneratedTest[]): Array<{ candidate: GeneratedTest; candidateIndex: number }> {
  const result: Array<{ candidate: GeneratedTest; candidateIndex: number }> = [];
  for (let candidateIndex = 0; candidateIndex < Math.min(candidates.length, 50); candidateIndex += 1) {
    const candidate = candidates[candidateIndex];
    if (isRunnableCandidate(candidate)) result.push({ candidate, candidateIndex });
  }
  return result;
}

export async function evaluateMutantFeedback(options: {
  candidates: GeneratedTest[];
  mutants: MutantSource[];
  languageId: number;
  run: MutantRunner;
  concurrency?: number;
}): Promise<CandidateMutationResult[]> {
  const candidates = boundedCandidates(options.candidates);
  const mutants = boundedMutants(options.mutants);
  const concurrency = boundedConcurrency(options.concurrency);
  const states = mutants.map((mutant) => ({ mutant, invalid: Boolean(staticCheck(mutant.sourceCode)) }));
  const probeIndexes = states.flatMap((state, index) => state.invalid ? [] : [index]);

  const probes = await mapConcurrent(probeIndexes, concurrency, async (index) => (
    options.run(states[index].mutant.sourceCode, "", options.languageId)
  ));
  for (let offset = 0; offset < probeIndexes.length; offset += 1) {
    if (probes[offset].compileError.trim()) states[probeIndexes[offset]].invalid = true;
  }

  const tasks = states.flatMap((state, mutantIndex) => state.invalid
    ? []
    : candidates.map(({ candidate, candidateIndex }) => ({ mutantIndex, candidateIndex, candidate })));
  const evaluated = await mapConcurrent(tasks, concurrency, async ({ mutantIndex, candidateIndex, candidate }) => {
    const state = states[mutantIndex];
    const run = await options.run(state.mutant.sourceCode, candidate.input, options.languageId);
    const survived = run.accepted
      && !run.compileError.trim()
      && normalizeOutput(run.stdout) === normalizeOutput(candidate.output);
    return {
      candidateIndex,
      mutantId: state.mutant.id,
      outcome: survived ? "survived" as const : "killed" as const,
    };
  });

  const rowsByMutant = new Map<string, CandidateMutationResult[]>();
  for (const row of evaluated) {
    const rows = rowsByMutant.get(row.mutantId) ?? [];
    rows.push(row);
    rowsByMutant.set(row.mutantId, rows);
  }

  return states.flatMap(({ mutant, invalid }) => invalid
    ? [{ candidateIndex: 0, mutantId: mutant.id, outcome: "invalid_mutant" as const }]
    : rowsByMutant.get(mutant.id) ?? []);
}
