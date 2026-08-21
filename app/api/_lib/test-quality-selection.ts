import type { GeneratedTest } from "./complexity-tests";

export type MutationOutcome = "survived" | "killed" | "invalid_mutant";

export type CandidateMutationResult = {
  candidateIndex: number;
  mutantId: string;
  outcome: MutationOutcome;
};

export type QualitySelectionReport = {
  usableMutants: number;
  killedMutants: number;
  mutationScore: number;
  selectedIndexes: number[];
  redundantIndexes: number[];
};

function boundedTarget(target: number, candidateCount: number): number {
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.min(candidateCount, Math.floor(target)));
}

function marginalKills(kills: ReadonlySet<string>, covered: ReadonlySet<string>): number {
  let count = 0;
  for (const mutantId of kills) if (!covered.has(mutantId)) count += 1;
  return count;
}

export function selectMutationEffectiveTests(
  candidates: GeneratedTest[],
  outcomes: CandidateMutationResult[],
  target: number,
  categoryQuota: Record<string, number>,
): { tests: GeneratedTest[]; report: QualitySelectionReport } {
  const limit = boundedTarget(target, candidates.length);
  const invalidMutants = new Set<string>();

  for (const result of outcomes) {
    const mutantId = result.mutantId.trim();
    if (mutantId && result.outcome === "invalid_mutant") invalidMutants.add(mutantId);
  }

  const usableMutants = new Set<string>();
  const killsByCandidate = candidates.map(() => new Set<string>());
  for (const result of outcomes) {
    const mutantId = result.mutantId.trim();
    if (!mutantId || invalidMutants.has(mutantId)) continue;
    if (!Number.isInteger(result.candidateIndex) || result.candidateIndex < 0 || result.candidateIndex >= candidates.length) continue;
    usableMutants.add(mutantId);
    if (result.outcome === "killed") killsByCandidate[result.candidateIndex].add(mutantId);
  }

  const selectedIndexes: number[] = [];
  const selected = new Set<number>();
  const covered = new Set<string>();
  const quotas = new Map<string, number>();
  const selectedByCategory = new Map<string, number>();

  for (const [category, rawQuota] of Object.entries(categoryQuota)) {
    const quota = Number.isFinite(rawQuota) ? Math.max(0, Math.floor(rawQuota)) : 0;
    if (quota > 0) quotas.set(category, quota);
  }

  const hasUnmetQuota = (category: string): boolean => (
    (selectedByCategory.get(category) ?? 0) < (quotas.get(category) ?? 0)
  );

  const chooseBest = (onlyUnmetQuota = false): number | null => {
    let bestIndex: number | null = null;
    let bestScore = -1;
    for (let index = 0; index < candidates.length; index += 1) {
      if (selected.has(index) || (onlyUnmetQuota && !hasUnmetQuota(candidates[index].category))) continue;
      const score = marginalKills(killsByCandidate[index], covered);
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    }
    return bestIndex;
  };

  const add = (index: number) => {
    selected.add(index);
    selectedIndexes.push(index);
    const category = candidates[index].category;
    selectedByCategory.set(category, (selectedByCategory.get(category) ?? 0) + 1);
    for (const mutantId of killsByCandidate[index]) covered.add(mutantId);
  };

  while (selectedIndexes.length < limit) {
    const index = chooseBest(true);
    if (index === null) break;
    add(index);
  }

  while (selectedIndexes.length < limit) {
    const index = chooseBest();
    if (index === null) break;
    add(index);
  }

  const redundantIndexes = candidates.flatMap((_, index) => selected.has(index) ? [] : [index]);
  return {
    tests: selectedIndexes.map((index) => candidates[index]),
    report: {
      usableMutants: usableMutants.size,
      killedMutants: covered.size,
      mutationScore: usableMutants.size ? covered.size / usableMutants.size : 0,
      selectedIndexes,
      redundantIndexes,
    },
  };
}
