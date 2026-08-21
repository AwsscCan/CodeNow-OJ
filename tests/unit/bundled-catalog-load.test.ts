// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetBundledCatalogForTests,
  getAcwingProblems,
  loadAcwingCatalog,
  loadBundledSamples,
  useLibraryStore,
} from "../../app/stores/library-store";

afterEach(() => {
  __resetBundledCatalogForTests();
  vi.unstubAllGlobals();
});

describe("题库索引加载与按需测试点", () => {
  it("题库页只加载轻量索引(samples 为空、保留 sampleCount)", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify([
      { id: "AW1", title: "a", difficulty: "普及", folder: "acwing/x", sourceUrl: "u", extractionStatus: "complete", sampleCount: 13 },
      { id: "CL1", title: "c", difficulty: "入门", folder: "经典题库/x", sourceUrl: "", extractionStatus: "complete", sampleCount: 12 },
    ]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    __resetBundledCatalogForTests();
    await loadAcwingCatalog();
    const problems = getAcwingProblems();
    expect(problems.map((p) => p.id)).toEqual(["AW1", "CL1"]);
    expect(problems[0].samples).toEqual([]);
    expect(problems[0].sampleCount).toBe(13);
    // 只请求一次索引，不再全量拉三个大文件
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("catalog-index.json");
  });

  it("按需加载单题测试点并缓存(第二次不重复请求)", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      id: "AW1", title: "a", samples: [{ id: 1, input: "1 2\n", output: "3\n" }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    __resetBundledCatalogForTests();
    const first = await loadBundledSamples("AW1");
    expect(first).toHaveLength(1);
    expect(first[0].output).toBe("3\n");
    const second = await loadBundledSamples("AW1");
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/problems/AW1.json");
  });

  it("索引加载失败不抛错(返回空题库)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    __resetBundledCatalogForTests();
    await loadAcwingCatalog();
    expect(getAcwingProblems()).toEqual([]);
  });

  it("索引内置目录与普通目录一样可移动和永久删除", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      { id: "AW1", title: "a", difficulty: "普及", folder: "内置题库/图论", sourceUrl: "u", extractionStatus: "complete", sampleCount: 13 },
    ]), { status: 200 })));
    __resetBundledCatalogForTests();
    await loadAcwingCatalog();
    useLibraryStore.setState({
      folders: ["默认题库", "我的目录"],
      builtinFolderOverrides: {},
      hiddenBuiltins: [],
    });

    useLibraryStore.getState().moveFolder("内置题库", "我的目录");
    expect(useLibraryStore.getState().builtinFolderOverrides.AW1).toBe("我的目录/内置题库/图论");

    useLibraryStore.getState().removeFolder("我的目录/内置题库");
    expect(useLibraryStore.getState().hiddenBuiltins).toContain("AW1");
  });
});
