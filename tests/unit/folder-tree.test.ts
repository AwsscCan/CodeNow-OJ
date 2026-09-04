import { beforeEach, describe, expect, it } from "vitest";
import { dissolveFolderLevel, planFolderMove } from "../../app/lib/folder-tree";
import { useLibraryStore, type ArchivedProblem } from "../../app/stores/library-store";

function archive(folder: string): ArchivedProblem {
  return {
    folder,
    archivedAt: "2026-07-27T00:00:00.000Z",
    problem: {
      id: "P1",
      title: "保留数据",
      difficulty: "普及",
      time: "1000 ms",
      memory: "128 MB",
      description: "题面",
      inputFormat: "输入",
      outputFormat: "输出",
      samples: [{ id: 1, input: "1\n", output: "1\n", category: "sample", targets: "原测试点" }],
    },
  };
}

describe("文件夹路径树变换", () => {
  it("把子文件夹移动到另一个根目录下并迁移整棵子树", () => {
    const plan = planFolderMove(
      ["动态规划", "图论", "图论/最短路", "图论/最短路/Floyd"],
      "图论/最短路",
      "动态规划",
    );

    expect(plan).toMatchObject({ ok: true });
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.nextPaths).toEqual(["动态规划", "图论", "动态规划/最短路", "动态规划/最短路/Floyd"]);
    expect(plan.remap("图论/最短路/Floyd")).toBe("动态规划/最短路/Floyd");
  });

  it("空目标父级会把文件夹提升到根级", () => {
    const plan = planFolderMove(["图论", "图论/最短路"], "图论/最短路", "");

    expect(plan).toMatchObject({ ok: true });
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.nextPaths).toEqual(["图论", "最短路"]);
  });

  it.each([
    { name: "自己的后代", paths: ["A", "A/B"], source: "A", parent: "A/B", error: "不能把文件夹移入自身或子文件夹" },
    { name: "同名目标", paths: ["A", "A/B", "C", "C/B"], source: "A/B", parent: "C", error: "目标文件夹下已有同名文件夹" },
    { name: "超过五级", paths: ["A", "A/B", "C", "C/D", "C/D/E", "C/D/E/F", "C/D/E/F/G"], source: "A/B", parent: "C/D/E/F/G", error: "最多支持 5 级文件夹" },
  ])("拒绝移动到$name", ({ paths, source, parent, error }) => {
    expect(planFolderMove(paths, source, parent)).toEqual({ ok: false, error });
  });

  it("解散只移除本级并把内部文件夹原样提升一级", () => {
    const plan = dissolveFolderLevel(["A", "A/B", "A/B/C", "A/B/C/D", "X"], "A/B");

    expect(plan.nextPaths).toEqual(["A", "A/C", "A/C/D", "X"]);
    expect(plan.remap("A/B")).toBe("A");
    expect(plan.remap("A/B/C/D")).toBe("A/C/D");
  });
});

describe("本地题库目录操作的数据安全", () => {
  beforeEach(() => {
    useLibraryStore.setState({
      folders: ["默认题库", "A", "A/B", "A/B/C"],
      archives: [archive("A/B/C")],
      deletedArchives: [],
      deletedBuiltins: [],
      hiddenBuiltins: [],
      collapsedFolders: ["A/B/C"],
      folderOrder: ["A/B", "A/B/C"],
      selectedFolder: "A/B/C",
    });
  });

  it("移动目录只重写路径，不改变题目与测试点数据", () => {
    const beforeProblem = useLibraryStore.getState().archives[0].problem;

    useLibraryStore.getState().moveFolder("A/B", "默认题库");

    const state = useLibraryStore.getState();
    expect(state.folders).toContain("默认题库/B/C");
    expect(state.archives[0].folder).toBe("默认题库/B/C");
    expect(state.archives[0].problem).toBe(beforeProblem);
    expect(state.archives[0].problem.samples).toEqual([
      { id: 1, input: "1\n", output: "1\n", category: "sample", targets: "原测试点" },
    ]);
  });

  it("解散目录只提升一层并保留题目与测试点", () => {
    const beforeProblem = useLibraryStore.getState().archives[0].problem;

    useLibraryStore.getState().dissolveFolder("A/B");

    const state = useLibraryStore.getState();
    expect(state.folders).toEqual(["默认题库", "A", "A/C"]);
    expect(state.archives[0].folder).toBe("A/C");
    expect(state.archives[0].problem).toBe(beforeProblem);
    expect(state.selectedFolder).toBe("A/C");
  });

  it("删除自有题目进入回收站并可恢复", () => {
    useLibraryStore.getState().removeArchive("P1");
    expect(useLibraryStore.getState().archives).toHaveLength(0);
    expect(useLibraryStore.getState().deletedArchives[0].problem.id).toBe("P1");
    useLibraryStore.getState().restoreArchive("P1");
    expect(useLibraryStore.getState().archives[0].problem.id).toBe("P1");
    expect(useLibraryStore.getState().deletedArchives).toHaveLength(0);
  });
});
