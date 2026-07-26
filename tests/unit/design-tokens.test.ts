import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readTokens(): string {
  try {
    return readFileSync(resolve(import.meta.dirname, "../../app/styles/tokens.css"), "utf8");
  } catch {
    return "";
  }
}

const css = readTokens();

/** 提取某选择器块内的声明体(token 块无嵌套,匹配到首个右花括号即可) */
function blockBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  return match ? match[1] : "";
}

function declaredTokens(body: string): Set<string> {
  return new Set([...body.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
}

const REQUIRED_BASE = [
  "--color-canvas", "--color-surface", "--color-ink", "--color-heading",
  "--color-muted", "--color-line", "--color-primary", "--color-primary-deep",
  "--color-success", "--color-danger", "--color-warning",
];

describe("design token 唯一真相源", () => {
  it(":root 声明全部必需基础颜色 token", () => {
    const root = declaredTokens(blockBody(":root"));
    for (const token of REQUIRED_BASE) {
      expect(root.has(token), `:root 缺 ${token}`).toBe(true);
    }
  });

  it(":root 定义主题无关的尺度 token(间距/圆角/字号/层级/动效)", () => {
    const root = declaredTokens(blockBody(":root"));
    for (const token of ["--space-4", "--radius-base", "--text-md", "--z-modal", "--motion-base", "--topbar-height"]) {
      expect(root.has(token), `:root 缺 ${token}`).toBe(true);
    }
  });

  it(".theme-dark 声明 --color-primary-deep(修复原 dark 缺 --blue2 的不对称)", () => {
    expect(declaredTokens(blockBody(".theme-dark")).has("--color-primary-deep")).toBe(true);
  });

  it(".theme-light 显式声明核心颜色 token(修复原 theme-light 零 CSS 变量覆盖)", () => {
    const light = declaredTokens(blockBody(".theme-light"));
    expect(light.has("--color-primary")).toBe(true);
    expect(light.has("--color-canvas")).toBe(true);
    expect(light.has("--color-muted")).toBe(true);
  });

  it(".theme-girl 保留珊瑚红 #c75c4b 硬约束(美术资产回归保护)", () => {
    expect(/--color-primary\s*:\s*#c75c4b/i.test(blockBody(".theme-girl"))).toBe(true);
  });

  it("三主题都定义焦点环 --shadow-focus(a11y 兜底基础)", () => {
    expect(declaredTokens(blockBody(".theme-light")).has("--shadow-focus")).toBe(true);
    expect(declaredTokens(blockBody(".theme-dark")).has("--shadow-focus")).toBe(true);
    expect(declaredTokens(blockBody(".theme-girl")).has("--shadow-focus")).toBe(true);
  });
});
