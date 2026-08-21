// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest 要求环境指令先于 import。 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/library",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../app/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }), signOut: vi.fn(async () => ({})) },
}));
vi.mock("../../app/lib/problem-api", () => ({ ProblemApi: {}, buildCloudFolderPaths: () => ({}) }));

import LibraryPage from "../../app/library/page";
import { __resetBundledCatalogForTests, useLibraryStore } from "../../app/stores/library-store";

beforeEach(() => {
  __resetBundledCatalogForTests();
  useLibraryStore.setState({
    folders: ["默认题库"], folderOrder: [], collapsedFolders: [], selectedFolder: "全部题目",
    archives: [], cloudArchives: [], cloudFolderIds: {}, librarySearch: "", hiddenBuiltins: [],
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("题库异步加载后自动重渲染(修复侧栏只显示默认题库)", () => {
  it("bundled 题源加载完成后侧栏出现对应文件夹", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      { id: "AW1", title: "a", difficulty: "普及", time: "1s", memory: "64MB", description: "", inputFormat: "", outputFormat: "", folder: "acwing/第一讲 基础算法/快速排序", sourceUrl: "https://www.cnblogs.com/example", extractionStatus: "complete", sampleCount: 13 },
      { id: "CL1", title: "c", difficulty: "普及", time: "1s", memory: "64MB", description: "", inputFormat: "", outputFormat: "", folder: "经典题库/枚举与模拟", sourceUrl: "", extractionStatus: "complete", sampleCount: 12 },
      { id: "CS0331", title: "词频统计", difficulty: "普及", time: "1s", memory: "64MB", description: "", inputFormat: "", outputFormat: "", folder: "竞赛真题/CSP 认证/第33次", sourceUrl: "https://oj.shumeng.tech/p/CSP202403A", extractionStatus: "complete", sampleCount: 1 },
    ]), { status: 200 })));

    const { container } = render(<LibraryPage />);
    // 初始渲染只有默认题库
    await waitFor(() => {
      const folders = Array.from(container.querySelectorAll(".folder-select span")).map((s) => s.textContent);
      expect(folders.some((f) => f?.includes("经典题库")), "加载完成后应出现经典题库文件夹").toBe(true);
    }, { timeout: 3000 });
    const folders = Array.from(container.querySelectorAll(".folder-select span")).map((s) => s.textContent);
    expect(folders.some((f) => f?.includes("竞赛真题"))).toBe(true);
  });

  it("题目行按各自 URL 显示真实来源，不再统一标成 AcWing 或博客园", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      { id: "AW1", title: "高精度", difficulty: "普及", time: "1s", memory: "64MB", description: "", inputFormat: "", outputFormat: "", folder: "acwing/基础", sourceUrl: "https://www.cnblogs.com/example", extractionStatus: "complete", sampleCount: 13 },
      { id: "CL1", title: "经典题", difficulty: "普及", time: "1s", memory: "64MB", description: "", inputFormat: "", outputFormat: "", folder: "经典题库/基础", sourceUrl: "", extractionStatus: "complete", sampleCount: 12 },
      { id: "CS0331", title: "词频统计", difficulty: "普及", time: "1s", memory: "64MB", description: "", inputFormat: "", outputFormat: "", folder: "竞赛真题/CSP 认证/第33次", sourceUrl: "https://oj.shumeng.tech/p/CSP202403A", extractionStatus: "complete", sampleCount: 1 },
    ]), { status: 200 })));

    const { container } = render(<LibraryPage />);
    await waitFor(() => expect(container.textContent).toContain("CSP 认证真题 · 曙梦 OJ"));
    expect(container.textContent).toContain("AcWing 题面 · 博客园整理");
    expect(container.textContent).toContain("CodeNow 内置题库");
  });
});
