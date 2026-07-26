// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest 要求环境指令先于 import。 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../app/stores/library-store", () => ({ loadAcwingCatalog: vi.fn(), getAcwingProblems: () => [], useLibraryStore: (sel: (s: { catalogVersion: number }) => unknown) => sel({ catalogVersion: 0 }) }));
vi.mock("../../app/stores/theme-store", () => ({
  useThemeStore: () => ({ themeMode: "light", setThemeMode: vi.fn(), editorTheme: "light", setEditorTheme: vi.fn() }),
}));
vi.mock("../../app/hooks/use-toast", () => ({ useToast: () => ({ notice: null, toast: vi.fn() }) }));
vi.mock("../../app/components/auth-status", () => ({ AuthStatus: () => null }));
vi.mock("../../app/components/toast", () => ({ Toast: () => null }));

import Home from "../../app/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("首页无障碍", () => {
  it("CTA 按钮无障碍名不含装饰箭头符号(应 aria-hidden 包裹)", () => {
    render(<Home />);
    const enter = screen.getByRole("button", { name: /进入题库/ });
    const name = enter.getAttribute("aria-label") ?? enter.textContent ?? "";
    expect(/[▸►→▶›»]/.test(name), "CTA 无障碍名残留箭头符号").toBe(false);
  });

  it("hero 为带无障碍名的 landmark region", () => {
    render(<Home />);
    expect(screen.getByRole("region", { name: /判题|OJ|CodeNow|编程/ })).toBeTruthy();
  });

  it("回归:网站主题切换器(radiogroup)与站点图标仍在", () => {
    render(<Home />);
    expect(screen.getByRole("radiogroup", { name: "网站主题" })).toBeTruthy();
    expect(screen.getByAltText("CodeNow 图标")).toBeTruthy();
  });

  it("非少女主题不渲染高木陪伴条装饰", () => {
    const { container } = render(<Home />);
    expect(container.querySelector(".quick-start-companion")).toBeNull();
  });
});
