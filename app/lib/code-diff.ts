export type CodeDiffKind = "equal" | "added" | "removed" | "changed";

export type CodeDiffRow = {
  kind: CodeDiffKind;
  left: string | null;
  right: string | null;
  leftLine: number | null;
  rightLine: number | null;
};

/** 生成适合双栏审阅的行级差异；长文件使用线性回退，避免编辑器卡顿。 */
export function buildCodeDiff(before: string, after: string): CodeDiffRow[] {
  const left = before.replace(/\r\n/g, "\n").split("\n");
  const right = after.replace(/\r\n/g, "\n").split("\n");
  const rows: CodeDiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (left[i] === right[j]) {
      rows.push({ kind: "equal", left: left[i] ?? "", right: right[j] ?? "", leftLine: i + 1, rightLine: j + 1 });
      i += 1;
      j += 1;
      continue;
    }
    if (i < left.length && j < right.length && left[i + 1] === right[j]) {
      rows.push({ kind: "removed", left: left[i], right: null, leftLine: i + 1, rightLine: null });
      i += 1;
      continue;
    }
    if (i < left.length && j < right.length && left[i] === right[j + 1]) {
      rows.push({ kind: "added", left: null, right: right[j], leftLine: null, rightLine: j + 1 });
      j += 1;
      continue;
    }
    if (i < left.length && j < right.length) {
      rows.push({ kind: "changed", left: left[i], right: right[j], leftLine: i + 1, rightLine: j + 1 });
      i += 1;
      j += 1;
      continue;
    }
    if (i < left.length) rows.push({ kind: "removed", left: left[i++], right: null, leftLine: i, rightLine: null });
    else rows.push({ kind: "added", left: null, right: right[j], leftLine: null, rightLine: ++j });
  }
  return rows;
}
