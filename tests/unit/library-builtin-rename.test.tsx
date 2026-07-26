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
import { INITIAL_PROBLEM } from "../../app/stores/problem-store";

beforeEach(() => {
  useLibraryStore.setState({
    folders: ["默认题库"], folderOrder: [], collapsedFolders: [], selectedFolder: "全部题目",
    archives: [], cloudArchives: [], cloudFolderIds: {}, librarySearch: "", hiddenBuiltins: [],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("内置题库去特权：可改题号(copy-on-write 物化)", () => {
  it("store.materializeBuiltin 归档改名副本并隐藏原内置", () => {
    useLibraryStore.getState().materializeBuiltin(INITIAL_PROBLEM, "默认题库", "NEW01");
    const s = useLibraryStore.getState();
    expect(s.archives[0].problem.id).toBe("NEW01");
    expect(s.archives[0].problem.title).toBe(INITIAL_PROBLEM.title);
    expect(s.archives[0].problem.samples.length).toBe(INITIAL_PROBLEM.samples.length);
    expect(s.hiddenBuiltins).toContain(INITIAL_PROBLEM.id);
  });

  it("内置 P1001 的题号可点击并通过重命名弹窗改号", () => {
    const { container } = render(<LibraryPage />);
    const builtinRow = container.querySelector(".catalog-row.built-in")!;
    const idButton = builtinRow.querySelector("button.catalog-id-edit");
    expect(idButton, "内置题号应可点击(不再 locked)").toBeTruthy();
    fireEvent.click(idButton!);
    fireEvent.change(screen.getByPlaceholderText("如 ALG001"), { target: { value: "ALG999" } });
    fireEvent.click(screen.getByText("保存新题号"));
    const s = useLibraryStore.getState();
    expect(s.archives.some((a) => a.problem.id === "ALG999")).toBe(true);
    expect(s.hiddenBuiltins).toContain(INITIAL_PROBLEM.id);
  });

  it("物化后原内置行不再显示，改名副本以归档行出现", () => {
    useLibraryStore.getState().materializeBuiltin(INITIAL_PROBLEM, "默认题库", "ALG999");
    const { container } = render(<LibraryPage />);
    expect(container.querySelector(".catalog-row.built-in"), "被物化的内置行不应再显示").toBeNull();
    expect(container.textContent).toContain("ALG999");
  });
});
