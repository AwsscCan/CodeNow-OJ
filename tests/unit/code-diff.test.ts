import { describe, expect, it } from "vitest";
import { buildCodeDiff } from "../../app/lib/code-diff";

describe("code diff", () => {
  it("aligns unchanged, removed, added, and changed lines", () => {
    expect(buildCodeDiff("a\nb\nc", "a\nx\nc\nd")).toEqual([
      { kind: "equal", left: "a", right: "a", leftLine: 1, rightLine: 1 },
      { kind: "changed", left: "b", right: "x", leftLine: 2, rightLine: 2 },
      { kind: "equal", left: "c", right: "c", leftLine: 3, rightLine: 3 },
      { kind: "added", left: null, right: "d", leftLine: null, rightLine: 4 },
    ]);
  });

  it("keeps an insertion and deletion visible in separate rows", () => {
    expect(buildCodeDiff("one\ntwo", "one\nthree\ntwo").map((row) => row.kind)).toEqual(["equal", "added", "equal"]);
  });

  it("uses unchanged lines as anchors across consecutive insertions", () => {
    expect(buildCodeDiff("a\nb\nc\nd\ne", "a\nx\ny\nc\nd\nf")).toEqual([
      { kind: "equal", left: "a", right: "a", leftLine: 1, rightLine: 1 },
      { kind: "changed", left: "b", right: "x", leftLine: 2, rightLine: 2 },
      { kind: "added", left: null, right: "y", leftLine: null, rightLine: 3 },
      { kind: "equal", left: "c", right: "c", leftLine: 3, rightLine: 4 },
      { kind: "equal", left: "d", right: "d", leftLine: 4, rightLine: 5 },
      { kind: "changed", left: "e", right: "f", leftLine: 5, rightLine: 6 },
    ]);
  });

  it("keeps a deletion aligned before the next stable anchor", () => {
    expect(buildCodeDiff("a\nremoved\nb\nold\nc", "a\nb\nchanged\nc").map((row) => ({ kind: row.kind, left: row.left, right: row.right }))).toEqual([
      { kind: "equal", left: "a", right: "a" },
      { kind: "removed", left: "removed", right: null },
      { kind: "equal", left: "b", right: "b" },
      { kind: "changed", left: "old", right: "changed" },
      { kind: "equal", left: "c", right: "c" },
    ]);
  });

  it("leaves a gap when a line is inserted before related replacements", () => {
    expect(buildCodeDiff(
      "start\nfoo(value);\nbar(value);\nend",
      "start\ntrace(value);\nfoo(nextValue);\nbar(nextValue);\nend",
    )).toEqual([
      { kind: "equal", left: "start", right: "start", leftLine: 1, rightLine: 1 },
      { kind: "added", left: null, right: "trace(value);", leftLine: null, rightLine: 2 },
      { kind: "changed", left: "foo(value);", right: "foo(nextValue);", leftLine: 2, rightLine: 3 },
      { kind: "changed", left: "bar(value);", right: "bar(nextValue);", leftLine: 3, rightLine: 4 },
      { kind: "equal", left: "end", right: "end", leftLine: 4, rightLine: 5 },
    ]);
  });

  it("leaves a gap when a line is removed between related replacements", () => {
    expect(buildCodeDiff(
      "start\nfoo(value);\ndebug(value);\nbar(value);\nend",
      "start\nfoo(nextValue);\nbar(nextValue);\nend",
    )).toEqual([
      { kind: "equal", left: "start", right: "start", leftLine: 1, rightLine: 1 },
      { kind: "changed", left: "foo(value);", right: "foo(nextValue);", leftLine: 2, rightLine: 2 },
      { kind: "removed", left: "debug(value);", right: null, leftLine: 3, rightLine: null },
      { kind: "changed", left: "bar(value);", right: "bar(nextValue);", leftLine: 4, rightLine: 3 },
      { kind: "equal", left: "end", right: "end", leftLine: 5, rightLine: 4 },
    ]);
  });
});
