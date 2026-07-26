// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest 要求环境指令先于 import。 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
vi.mock("../../app/stores/library-store", () => ({
  loadAcwingCatalog: vi.fn(),
  getAcwingProblems: () => [
    { id: "AW789", title: "快速排序", difficulty: "普及" as const, time: "1000 ms", memory: "64 MB", description: "排序", inputFormat: "", outputFormat: "", samples: [], folder: "算法基础课/基础算法", sourceUrl: "https://example.com/789" },
    { id: "AW790", title: "归并排序", difficulty: "普及" as const, time: "1000 ms", memory: "64 MB", description: "排序", inputFormat: "", outputFormat: "", samples: [], folder: "算法基础课/基础算法", sourceUrl: "https://example.com/790" },
  ],
  useLibraryStore: (sel: (s: { catalogVersion: number }) => unknown) => sel({ catalogVersion: 0 }),
}));
vi.mock("../../app/stores/theme-store", () => ({
  useThemeStore: () => ({ themeMode: "girl", setThemeMode: vi.fn(), editorTheme: "girl", setEditorTheme: vi.fn() }),
}));
vi.mock("../../app/hooks/use-toast", () => ({ useToast: () => ({ notice: null, toast: vi.fn() }) }));
vi.mock("../../app/components/auth-status", () => ({ AuthStatus: () => null }));
vi.mock("../../app/components/toast", () => ({ Toast: () => null }));

import Home from "../../app/page";
import { INITIAL_PROBLEM, useProblemStore } from "../../app/stores/problem-store";

beforeEach(() => {
  useProblemStore.setState({ problem: INITIAL_PROBLEM });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("首页做题入口", () => {
  it("主 CTA 跳转到 store 当前题，而不是硬编码 P1001", () => {
    useProblemStore.setState({ problem: { ...INITIAL_PROBLEM, id: "CF0042", title: "滑动窗口" } });
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "开始做题" }));
    expect(push).toHaveBeenCalledWith("/problem/CF0042");
  });

  it("主 CTA 附近展示当前题上下文(题号)", () => {
    useProblemStore.setState({ problem: { ...INITIAL_PROBLEM, id: "CF0042", title: "滑动窗口" } });
    const { container } = render(<Home />);
    expect(container.querySelector(".hero-section")?.textContent).toContain("CF0042");
  });

  it("渲染快速开始精选题目区", () => {
    const { container } = render(<Home />);
    expect(container.querySelector(".quick-start"), "缺少 .quick-start 入口区").toBeTruthy();
    expect(screen.getByText("快速排序")).toBeTruthy();
    expect(screen.getByText("归并排序")).toBeTruthy();
    expect(screen.getByText(INITIAL_PROBLEM.title, { selector: ".quick-start b" })).toBeTruthy();
  });

  it("点击精选题目会装载题目并跳转对应做题页", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: /快速排序/ }));
    expect(useProblemStore.getState().problem.id).toBe("AW789");
    expect(push).toHaveBeenCalledWith("/problem/AW789");
  });

  it("点击内置题会装载 P1001 并跳转", () => {
    useProblemStore.setState({ problem: { ...INITIAL_PROBLEM, id: "CF0042", title: "滑动窗口" } });
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(INITIAL_PROBLEM.title.replace(/[+]/g, "\\+")) }));
    expect(useProblemStore.getState().problem.id).toBe("P1001");
    expect(push).toHaveBeenCalledWith("/problem/P1001");
  });

  it("少女主题下快速开始卡渲染高木陪伴条(装饰头像+台词)", () => {
    const { container } = render(<Home />);
    const companion = container.querySelector(".quick-start-companion");
    expect(companion, "缺少 .quick-start-companion 陪伴条").toBeTruthy();
    const img = companion!.querySelector("img");
    expect(img?.getAttribute("src")).toContain("study-smile");
    expect(img?.getAttribute("alt")).toBe("");
    expect(companion!.getAttribute("aria-hidden")).toBe("true");
    expect(companion!.textContent).toContain("一緒に");
  });
});
