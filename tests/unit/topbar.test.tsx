// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest 要求环境指令先于 import。 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useSession, push, setThemeMode } = vi.hoisted(() => ({
  useSession: vi.fn(() => ({ data: null, isPending: false })),
  push: vi.fn(),
  setThemeMode: vi.fn(),
}));

vi.mock("../../app/lib/auth-client", () => ({
  authClient: { useSession, signOut: vi.fn(async () => ({})) },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
vi.mock("../../app/stores/theme-store", () => ({
  useThemeStore: () => ({ themeMode: "girl", setThemeMode, editorTheme: "girl", setEditorTheme: vi.fn() }),
}));

import { Topbar } from "../../app/components/topbar";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("顶栏主题切换分段控件", () => {
  it("渲染 radiogroup(网站主题)与三个主题选项", () => {
    render(<Topbar onToast={() => {}} />);
    const group = screen.getByRole("radiogroup", { name: "网站主题" });
    expect(group).toBeTruthy();
    for (const label of ["亮色", "暗色", "少女"]) {
      expect(screen.getByRole("radio", { name: label }), `缺少 ${label} 选项`).toBeTruthy();
    }
  });

  it("当前主题选项 aria-checked，其余为 false", () => {
    render(<Topbar onToast={() => {}} />);
    expect(screen.getByRole("radio", { name: "少女" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "亮色" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("radio", { name: "暗色" }).getAttribute("aria-checked")).toBe("false");
  });

  it("点击其它主题选项调用 setThemeMode", () => {
    render(<Topbar onToast={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: "亮色" }));
    expect(setThemeMode).toHaveBeenCalledWith("light");
    fireEvent.click(screen.getByRole("radio", { name: "暗色" }));
    expect(setThemeMode).toHaveBeenCalledWith("dark");
  });

  it("选项图标为纯装饰(aria-hidden)，无障碍名不含符号", () => {
    render(<Topbar onToast={() => {}} />);
    const girl = screen.getByRole("radio", { name: "少女" });
    const icon = girl.querySelector("[aria-hidden='true']");
    expect(icon, "主题选项缺少装饰图标").toBeTruthy();
  });
});

describe("顶栏登录入口", () => {
  it("未登录时登录链接无障碍名为「登录」且携带装饰图标", () => {
    render(<Topbar onToast={() => {}} />);
    const login = screen.getByRole("link", { name: "登录" });
    expect(login.classList.contains("header-login")).toBe(true);
    expect(login.querySelector("[aria-hidden='true']"), "登录按钮缺少装饰图标").toBeTruthy();
  });
});
