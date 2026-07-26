// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest 要求环境指令先于 import。 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/library",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../app/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }), signOut: vi.fn(async () => ({})) },
}));
vi.mock("../../app/lib/problem-api", () => ({ ProblemApi: {}, buildCloudFolderPaths: () => ({}) }));

const acwing = [
  { id: "AW791", title: "高精度加法", difficulty: "入门", time: "1s", memory: "64MB", description: "", inputFormat: "", outputFormat: "", samples: [], folder: "acwing/第一讲 基础算法/高精度", sourceUrl: "x", extractionStatus: "complete" },
  { id: "AW895", title: "最长上升子序列", difficulty: "普及", time: "1s", memory: "64MB", description: "", inputFormat: "", outputFormat: "", samples: [], folder: "acwing/第五讲 动态规划/线性DP", sourceUrl: "x", extractionStatus: "complete" },
];
vi.mock("../../app/stores/library-store", async (orig) => {
  const actual = await orig() as Record<string, unknown>;
  return { ...actual, getAcwingProblems: () => acwing, getAcwingFolders: () => ["acwing", "acwing/第一讲 基础算法", "acwing/第一讲 基础算法/高精度", "acwing/第五讲 动态规划", "acwing/第五讲 动态规划/线性DP"], loadAcwingCatalog: vi.fn() };
});

import LibraryPage from "../../app/library/page";
import { useLibraryStore } from "../../app/stores/library-store";

beforeEach(() => {
  useLibraryStore.setState({
    folders: ["默认题库"], folderOrder: [], collapsedFolders: [], selectedFolder: "全部题目",
    archives: [], cloudArchives: [], cloudFolderIds: {}, librarySearch: "", hiddenBuiltins: [], catalogVersion: 1,
  });
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("题库搜索对全部题源生效", () => {
  it("搜索标题只保留匹配的 AcWing 题", () => {
    const { container } = render(<LibraryPage />);
    fireEvent.change(container.querySelector(".catalog-toolbar input")!, { target: { value: "高精度" } });
    const rows = Array.from(container.querySelectorAll(".catalog-row")).map((r) => r.textContent);
    expect(rows.some((t) => t?.includes("高精度加法")), "应保留高精度加法").toBe(true);
    expect(rows.some((t) => t?.includes("最长上升子序列")), "不匹配的题应被过滤").toBe(false);
  });

  it("搜索题号也能命中", () => {
    const { container } = render(<LibraryPage />);
    fireEvent.change(container.querySelector(".catalog-toolbar input")!, { target: { value: "AW895" } });
    const rows = Array.from(container.querySelectorAll(".catalog-row")).map((r) => r.textContent);
    expect(rows.some((t) => t?.includes("最长上升子序列"))).toBe(true);
    expect(rows.some((t) => t?.includes("高精度加法"))).toBe(false);
  });

  it("清空搜索恢复全部题目", () => {
    const { container } = render(<LibraryPage />);
    fireEvent.change(container.querySelector(".catalog-toolbar input")!, { target: { value: "高精度" } });
    fireEvent.change(container.querySelector(".catalog-toolbar input")!, { target: { value: "" } });
    const rows = Array.from(container.querySelectorAll(".catalog-row")).map((r) => r.textContent);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
