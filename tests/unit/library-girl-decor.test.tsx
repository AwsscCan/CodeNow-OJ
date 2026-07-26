// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest 要求环境指令先于 import。 */
import { cleanup, render } from "@testing-library/react";
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
import { useThemeStore } from "../../app/stores/theme-store";

beforeEach(() => {
  useThemeStore.setState({ themeMode: "girl" });
});

afterEach(() => {
  useThemeStore.setState({ themeMode: "light" });
  cleanup();
  vi.clearAllMocks();
});

describe("题库页少女主题拍立得装饰", () => {
  it("少女主题渲染三张拍立得立绘(纯装饰、懒加载)", () => {
    const { container } = render(<LibraryPage />);
    const stack = container.querySelector(".girl-portrait-stack");
    expect(stack, "缺少 .girl-portrait-stack 拍立得").toBeTruthy();
    expect(stack!.getAttribute("aria-hidden")).toBe("true");
    const images = stack!.querySelectorAll("img");
    expect(images).toHaveLength(3);
    const srcs = Array.from(images).map((img) => img.getAttribute("src"));
    expect(srcs.some((s) => s?.includes("portrait-ribbon"))).toBe(true);
    expect(srcs.some((s) => s?.includes("portrait-sailor"))).toBe(true);
    expect(srcs.some((s) => s?.includes("sunny-selfie"))).toBe(true);
    for (const img of images) {
      expect(img.getAttribute("alt")).toBe("");
      expect(img.getAttribute("loading")).toBe("lazy");
    }
  });

  it("亮色主题不渲染拍立得(不为非少女主题浪费流量)", () => {
    useThemeStore.setState({ themeMode: "light" });
    const { container } = render(<LibraryPage />);
    expect(container.querySelector(".girl-portrait-stack")).toBeNull();
  });
});
