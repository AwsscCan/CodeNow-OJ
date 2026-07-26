// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest 要求环境指令先于 import。 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../app/stores/library-store", () => ({ loadAcwingCatalog: vi.fn(), getAcwingProblems: () => [], useLibraryStore: (sel: (s: { catalogVersion: number }) => unknown) => sel({ catalogVersion: 0 }) }));
vi.mock("../../app/stores/theme-store", () => ({
  useThemeStore: () => ({ themeMode: "girl", setThemeMode: vi.fn(), editorTheme: "girl", setEditorTheme: vi.fn() }),
}));
vi.mock("../../app/hooks/use-toast", () => ({ useToast: () => ({ notice: null, toast: vi.fn() }) }));
vi.mock("../../app/components/auth-status", () => ({ AuthStatus: () => null }));
vi.mock("../../app/components/toast", () => ({ Toast: () => null }));

import Home from "../../app/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("首页 hero 跟随主题(不再内联硬编码颜色)", () => {
  it("hero 区及后代不得残留内联 color/background(改由 CSS 类驱动,可跟随三主题)", () => {
    const { container } = render(<Home />);
    const hero = container.querySelector(".hero-section");
    expect(hero, "缺少 .hero-section").toBeTruthy();
    const nodes = [hero as Element, ...Array.from((hero as Element).querySelectorAll("*"))];
    for (const node of nodes) {
      const style = node.getAttribute("style") ?? "";
      expect(/color\s*:/.test(style), `内联 color 残留: <${node.tagName.toLowerCase()} class="${node.className}">`).toBe(false);
      expect(/background/.test(style), `内联 background 残留: <${node.tagName.toLowerCase()} class="${node.className}">`).toBe(false);
    }
  });

  it("hero 关键元素携带语义类名", () => {
    const { container } = render(<Home />);
    for (const cls of [".hero-section", ".hero-eyebrow", ".hero-title", ".hero-tagline", ".hero-cta-primary", ".hero-cta-secondary"]) {
      expect(container.querySelector(cls), `缺少 ${cls}`).toBeTruthy();
    }
  });
});
