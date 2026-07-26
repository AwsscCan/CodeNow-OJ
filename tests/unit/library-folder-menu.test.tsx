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

  it("默认题库不可操作，⋮ 保持非按钮", () => {
    const row = entryOf("默认题库");
    expect(row.querySelector("button.folder-drag")).toBeNull();
  });
});
