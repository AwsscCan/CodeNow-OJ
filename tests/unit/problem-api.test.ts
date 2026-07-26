import { describe, expect, it } from "vitest";
import { buildCloudFolderPaths } from "../../app/lib/problem-api";

describe("cloud folder paths", () => {
  it("builds stable nested paths regardless of server order", () => {
    const result = buildCloudFolderPaths([
      { id: "child", parentId: "root", name: "动态规划" },
      { id: "root", parentId: null, name: "算法" },
    ]);
    expect(result).toEqual({ 算法: "root", "算法/动态规划": "child" });
  });

  it("ignores folders whose parent is missing or cyclic", () => {
    const result = buildCloudFolderPaths([
      { id: "orphan", parentId: "missing", name: "孤儿" },
      { id: "a", parentId: "b", name: "A" },
      { id: "b", parentId: "a", name: "B" },
    ]);
    expect(result).toEqual({});
  });
});
