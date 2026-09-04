export type CodeDiffKind = "equal" | "added" | "removed" | "changed";

export type CodeDiffRow = {
  kind: CodeDiffKind;
  left: string | null;
  right: string | null;
  leftLine: number | null;
  rightLine: number | null;
};

type DiffOp =
  | { type: "equal"; value: string; leftLine: number; rightLine: number }
  | { type: "removed"; value: string; line: number }
  | { type: "added"; value: string; line: number };

type BlockAlignment =
  | { type: "changed"; left: Extract<DiffOp, { type: "removed" }>; right: Extract<DiffOp, { type: "added" }> }
  | { type: "removed"; left: Extract<DiffOp, { type: "removed" }> }
  | { type: "added"; right: Extract<DiffOp, { type: "added" }> };

const MAX_LCS_CELLS = 4_000_000;
const ALIGNMENT_GAP_COST = 1;

type LineProfile = {
  trimmed: string;
  tokens: string[];
  head: string | undefined;
};

function profileLine(value: string): LineProfile {
  const trimmed = value.trim();
  const tokens = trimmed.match(/[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|[^\s\w]/g) ?? [];
  return { trimmed, tokens, head: tokens.find((token) => /^[A-Za-z_$]/.test(token)) };
}

function lcsLength(left: string[], right: string[]): number {
  const row = new Uint16Array(right.length + 1);
  for (const leftToken of left) {
    let diagonal = 0;
    for (let j = 1; j <= right.length; j += 1) {
      const previous = row[j];
      row[j] = leftToken === right[j - 1] ? diagonal + 1 : Math.max(row[j], row[j - 1]);
      diagonal = previous;
    }
  }
  return row[right.length] ?? 0;
}

function lineSimilarity(left: LineProfile, right: LineProfile): number {
  if (left.tokens.length === 0 || right.tokens.length === 0) return left.trimmed === right.trimmed ? 1 : 0;

  const tokenSimilarity = (2 * lcsLength(left.tokens, right.tokens)) / (left.tokens.length + right.tokens.length);
  const headBonus = left.head && left.head === right.head ? 0.2 : 0;
  return Math.min(1, tokenSimilarity + headBonus);
}

function substitutionCost(left: LineProfile, right: LineProfile): number {
  return 1.8 - 1.2 * lineSimilarity(left, right);
}

function alignChangedBlock(
  removed: Extract<DiffOp, { type: "removed" }>[],
  added: Extract<DiffOp, { type: "added" }>[],
): BlockAlignment[] {
  const removedProfiles = removed.map((operation) => profileLine(operation.value));
  const addedProfiles = added.map((operation) => profileLine(operation.value));
  const costs = Array.from({ length: removed.length + 1 }, () => new Float64Array(added.length + 1));
  const actions = Array.from({ length: removed.length + 1 }, () => new Uint8Array(added.length + 1));

  for (let i = 1; i <= removed.length; i += 1) {
    costs[i][0] = i * ALIGNMENT_GAP_COST;
    actions[i][0] = 1;
  }
  for (let j = 1; j <= added.length; j += 1) {
    costs[0][j] = j * ALIGNMENT_GAP_COST;
    actions[0][j] = 2;
  }

  for (let i = 1; i <= removed.length; i += 1) {
    for (let j = 1; j <= added.length; j += 1) {
      const changedCost = costs[i - 1][j - 1] + substitutionCost(removedProfiles[i - 1], addedProfiles[j - 1]);
      const removedCost = costs[i - 1][j] + ALIGNMENT_GAP_COST;
      const addedCost = costs[i][j - 1] + ALIGNMENT_GAP_COST;

      // On a tie, keep the earlier pairing and place the surplus line in a gap.
      if (changedCost < removedCost && changedCost < addedCost) {
        costs[i][j] = changedCost;
        actions[i][j] = 3;
      } else if (removedCost <= addedCost) {
        costs[i][j] = removedCost;
        actions[i][j] = 1;
      } else {
        costs[i][j] = addedCost;
        actions[i][j] = 2;
      }
    }
  }

  const alignment: BlockAlignment[] = [];
  let i = removed.length;
  let j = added.length;
  while (i > 0 || j > 0) {
    const action = actions[i][j];
    if (action === 3) {
      alignment.push({ type: "changed", left: removed[i - 1], right: added[j - 1] });
      i -= 1;
      j -= 1;
    } else if (action === 1) {
      alignment.push({ type: "removed", left: removed[i - 1] });
      i -= 1;
    } else {
      alignment.push({ type: "added", right: added[j - 1] });
      j -= 1;
    }
  }
  return alignment.reverse();
}

function greedyDiff(left: string[], right: string[]): CodeDiffRow[] {
  const rows: CodeDiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (left[i] === right[j]) {
      rows.push({ kind: "equal", left: left[i] ?? "", right: right[j] ?? "", leftLine: i + 1, rightLine: j + 1 });
      i += 1;
      j += 1;
    } else if (i < left.length && j < right.length && left[i + 1] === right[j]) {
      rows.push({ kind: "removed", left: left[i], right: null, leftLine: i + 1, rightLine: null });
      i += 1;
    } else if (i < left.length && j < right.length && left[i] === right[j + 1]) {
      rows.push({ kind: "added", left: null, right: right[j], leftLine: null, rightLine: j + 1 });
      j += 1;
    } else if (i < left.length && j < right.length) {
      rows.push({ kind: "changed", left: left[i], right: right[j], leftLine: i + 1, rightLine: j + 1 });
      i += 1;
      j += 1;
    } else if (i < left.length) {
      i += 1;
      rows.push({ kind: "removed", left: left[i - 1], right: null, leftLine: i, rightLine: null });
    } else {
      j += 1;
      rows.push({ kind: "added", left: null, right: right[j - 1], leftLine: null, rightLine: j });
    }
  }
  return rows;
}

function lcsOperations(left: string[], right: string[]): DiffOp[] {
  const table = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] = left[i] === right[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const operations: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      operations.push({ type: "equal", value: left[i], leftLine: i + 1, rightLine: j + 1 });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      operations.push({ type: "removed", value: left[i], line: i + 1 });
      i += 1;
    } else {
      operations.push({ type: "added", value: right[j], line: j + 1 });
      j += 1;
    }
  }
  while (i < left.length) operations.push({ type: "removed", value: left[i], line: i++ + 1 });
  while (j < right.length) operations.push({ type: "added", value: right[j], line: j++ + 1 });
  return operations;
}

/** 生成稳定的行级差异；连续插入/删除按最小范围配对，保持两栏锚点对齐。 */
export function buildCodeDiff(before: string, after: string): CodeDiffRow[] {
  const left = before.replace(/\r\n/g, "\n").split("\n");
  const right = after.replace(/\r\n/g, "\n").split("\n");
  if ((left.length + 1) * (right.length + 1) > MAX_LCS_CELLS) return greedyDiff(left, right);

  const operations = lcsOperations(left, right);
  const rows: CodeDiffRow[] = [];
  let index = 0;
  while (index < operations.length) {
    const operation = operations[index];
    if (operation.type === "equal") {
      rows.push({ kind: "equal", left: operation.value, right: operation.value, leftLine: operation.leftLine, rightLine: operation.rightLine });
      index += 1;
      continue;
    }

    const removed: Extract<DiffOp, { type: "removed" }>[] = [];
    const added: Extract<DiffOp, { type: "added" }>[] = [];
    while (index < operations.length && operations[index].type !== "equal") {
      const current = operations[index++];
      if (current.type === "removed") removed.push(current);
      else if (current.type === "added") added.push(current);
    }
    for (const aligned of alignChangedBlock(removed, added)) {
      if (aligned.type === "changed") {
        rows.push({ kind: "changed", left: aligned.left.value, right: aligned.right.value, leftLine: aligned.left.line, rightLine: aligned.right.line });
      } else if (aligned.type === "removed") {
        rows.push({ kind: "removed", left: aligned.left.value, right: null, leftLine: aligned.left.line, rightLine: null });
      } else {
        rows.push({ kind: "added", left: null, right: aligned.right.value, leftLine: null, rightLine: aligned.right.line });
      }
    }
  }
  return rows;
}
