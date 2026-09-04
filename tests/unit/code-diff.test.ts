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
});
