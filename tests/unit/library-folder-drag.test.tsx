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
vi.mock("../../app/lib/problem-api", () => ({
  ProblemApi: {},
  buildCloudFolderPaths: () => ({}),
}));

import LibraryPage from "../../app/library/page";
import { useLibraryStore } from "../../app/stores/library-store";

/** fireEvent 拖拽事件所需的 dataTransfer 桩 */
function dataTransferStub() {
  return { effectAllowed: "", dropEffect: "", setData: vi.fn(), getData: vi.fn(() => "") };
}

beforeEach(() => {
  useLibraryStore.setState({
    folders: ["默认题库", "动态规划", "图论"],
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
  vi.clearAllMocks();
});

describe("题库文件夹整行拖动排序", () => {
  it("文件夹整行(folder-entry)可拖动，不再只有 ⋮ 小按钮", () => {
    const { container } = render(<LibraryPage />);
    const rows = container.querySelectorAll(".folder-entry[draggable='true']");
    expect(rows.length, "folder-entry 行应整体可拖动").toBeGreaterThanOrEqual(3);
  });

  it("拖起时写入 dataTransfer 数据(Firefox 需要 setData 才会启动拖拽)", () => {
    const { container } = render(<LibraryPage />);
    const rows = container.querySelectorAll(".folder-entry");
    const dt = dataTransferStub();
    fireEvent.dragStart(rows[1], { dataTransfer: dt });
    expect(dt.setData).toHaveBeenCalled();
  });

  it("整行拖拽落到同级行上会更新 folderOrder", () => {
    const { container } = render(<LibraryPage />);
    const rows = () => container.querySelectorAll(".folder-entry");
    // 行序为 orderedFolders 自然序：图论 在 动态规划 之后；把 图论 拖到 动态规划 前
    const source = Array.from(rows()).find((row) => row.textContent!.includes("图论"))!;
    const target = Array.from(rows()).find((row) => row.textContent!.includes("动态规划"))!;
    const dt = dataTransferStub();
    fireEvent.dragStart(source, { dataTransfer: dt });
    fireEvent.dragOver(target, { dataTransfer: dt });
    fireEvent.drop(target, { dataTransfer: dt, clientY: 0 });
    const order = useLibraryStore.getState().folderOrder;
    expect(order.length, "拖拽后应写入手动排序").toBeGreaterThan(0);
    expect(order.indexOf("图论"), "图论 应排到 动态规划 之前").toBeLessThan(order.indexOf("动态规划"));
  });
});
