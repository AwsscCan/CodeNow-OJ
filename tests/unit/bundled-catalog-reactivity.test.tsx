// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest 要求环境指令先于 import。 */
import { act, cleanup, render, waitFor } from "@testing-library/react";
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
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url);
      if (path.includes("acwing")) return new Response(JSON.stringify([{ id: "AW1", title: "a", difficulty: "普及", time: "1s", memory: "64MB", description: "", inputFormat: "", outputFormat: "", samples: [], folder: "acwing/第一讲 基础算法/快速排序", sourceUrl: "x", extractionStatus: "complete" }]), { status: 200 });
      if (path.includes("classic")) return new Response(JSON.stringify([{ id: "CL1", title: "c", difficulty: "普及", time: "1s", memory: "64MB", description: "", inputFormat: "", outputFormat: "", samples: [], folder: "经典题库/枚举与模拟", sourceUrl: "", extractionStatus: "complete" }]), { status: 200 });
      if (path.includes("contest")) return new Response(JSON.stringify([{ id: "CS1", title: "s", difficulty: "普及", time: "1s", memory: "64MB", description: "", inputFormat: "", outputFormat: "", samples: [], folder: "竞赛真题/CSP-J 入门级", sourceUrl: "", extractionStatus: "complete" }]), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    }));

    const { container } = render(<LibraryPage />);
    // 初始渲染只有默认题库
    await waitFor(() => {
      const folders = Array.from(container.querySelectorAll(".folder-select span")).map((s) => s.textContent);
      expect(folders.some((f) => f?.includes("经典题库")), "加载完成后应出现经典题库文件夹").toBe(true);
    }, { timeout: 3000 });
    const folders = Array.from(container.querySelectorAll(".folder-select span")).map((s) => s.textContent);
    expect(folders.some((f) => f?.includes("竞赛真题"))).toBe(true);
  });
});
