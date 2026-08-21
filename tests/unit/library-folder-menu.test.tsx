// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest 要求环境指令先于 import。 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/library",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../app/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }), signOut: vi.fn(async () => ({})) },
}));
vi.mock("../../app/lib/problem-api", () => ({
  ProblemApi: {},
  buildCloudFolderPaths: () => ({}),
}));

import LibraryPage from "../../app/library/page";
import { useLibraryStore } from "../../app/stores/library-store";

beforeEach(() => {
  useLibraryStore.setState({
    folders: ["默认题库", "动态规划"],
    folderOrder: [],
    collapsedFolders: [],
    selectedFolder: "全部题目",
    archives: [],
    cloudArchives: [],
    cloudFolderIds: {},
    librarySearch: "",
    builtinFolderOverrides: {},
    hiddenBuiltins: [],
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("文件夹 ⋮ 操作菜单", () => {
  function entryOf(name: string) {
    const { container } = render(<LibraryPage />);
    return Array.from(container.querySelectorAll(".folder-entry")).find((row) => row.textContent!.includes(name))!;
  }

  it("可操作文件夹的 ⋮ 是菜单按钮，点击弹出散/删菜单", () => {
    const row = entryOf("动态规划");
    const trigger = row.querySelector("button.folder-drag");
    expect(trigger, "⋮ 应为可点击的菜单按钮").toBeTruthy();
    fireEvent.click(trigger!);
    const menu = document.querySelector(".folder-menu");
    expect(menu, "点击 ⋮ 应弹出操作菜单").toBeTruthy();
    expect(menu!.textContent).toContain("散");
    expect(menu!.textContent).toContain("删");
  });

  it("菜单中的删除项走确认后删除文件夹", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const row = entryOf("动态规划");
    fireEvent.click(row.querySelector("button.folder-drag")!);
    fireEvent.click(screen.getByText(/永久删除|^删/));
    expect(useLibraryStore.getState().folders).not.toContain("动态规划");
  });

  it("行尾不再平铺散/删小按钮(已收进菜单)", () => {
    const row = entryOf("动态规划");
    expect(row.querySelector(".folder-action"), "散/删应收进 ⋮ 菜单").toBeNull();
  });

  it("内置默认题库与普通文件夹一样提供操作菜单", () => {
    const row = entryOf("默认题库");
    const trigger = row.querySelector("button.folder-drag");
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger!);
    expect(document.querySelector(".folder-menu")?.textContent).toContain("解散");
  });

  it("永久删除内置目录经确认后隐藏其中内置题", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const row = entryOf("默认题库");
    fireEvent.click(row.querySelector("button.folder-drag")!);
    fireEvent.click(screen.getByText(/永久删除|^删/));
    expect(useLibraryStore.getState().hiddenBuiltins).toContain("P1001");
  });

  it("取消永久删除时内置目录和题目保持不变", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const row = entryOf("默认题库");
    fireEvent.click(row.querySelector("button.folder-drag")!);
    fireEvent.click(screen.getByText(/永久删除|^删/));
    expect(useLibraryStore.getState().folders).toContain("默认题库");
    expect(useLibraryStore.getState().hiddenBuiltins).not.toContain("P1001");
  });

  it("解散只移除本级，内层文件夹与题目测试点提升后仍保留", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    useLibraryStore.setState({
      folders: ["默认题库", "图论", "图论/最短路", "图论/最短路/Floyd"],
      archives: [{
        folder: "图论/最短路/Floyd",
        archivedAt: "2026-07-27T00:00:00.000Z",
        problem: { id: "P1", title: "题", difficulty: "普及", time: "1s", memory: "128MB", description: "", inputFormat: "", outputFormat: "", samples: [{ id: 1, input: "1", output: "1" }] },
      }],
    });
    const { container } = render(<LibraryPage />);
    const row = Array.from(container.querySelectorAll(".folder-entry")).find((item) =>
      item.querySelector(".folder-select span")?.textContent?.trim() === "▱ 最短路",
    )!;

    fireEvent.click(row.querySelector("button.folder-drag")!);
    fireEvent.click(screen.getByText(/解散并保留题目/));

    const state = useLibraryStore.getState();
    expect(state.folders).toContain("图论/Floyd");
    expect(state.folders).not.toContain("图论/最短路");
    expect(state.archives[0].folder).toBe("图论/Floyd");
    expect(state.archives[0].problem.samples).toEqual([{ id: 1, input: "1", output: "1" }]);
  });
});
