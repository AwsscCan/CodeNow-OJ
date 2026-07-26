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

function blockBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  return match ? match[1] : "";
}

/** 仅提取颜色语义 token(--bg-autumn 等专属 token 不参与三主题对称约束) */
function colorTokens(body: string): Set<string> {
  return new Set([...body.matchAll(/(--color-[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
}

const light = colorTokens(blockBody(".theme-light"));
const dark = colorTokens(blockBody(".theme-dark"));
const girl = colorTokens(blockBody(".theme-girl"));

describe("三主题 token 对称性护栏", () => {
  it("theme-girl 至少定义一批颜色 token(护栏自身有效性)", () => {
    expect(girl.size).toBeGreaterThan(20);
  });

  it("theme-light 覆盖 theme-girl 的全部颜色 token", () => {
    for (const token of girl) {
      expect(light.has(token), `theme-light 缺 ${token}`).toBe(true);
    }
  });

  it("theme-dark 覆盖 theme-girl 的全部颜色 token", () => {
    for (const token of girl) {
      expect(dark.has(token), `theme-dark 缺 ${token}`).toBe(true);
    }
  });

  it("girl --color-primary 为秋日珊瑚红(#c75c4b)", () => {
    const match = blockBody(".theme-girl").match(/--color-primary\s*:\s*(#[0-9a-f]{3,8})/i);
    expect(match?.[1]?.toLowerCase()).toBe("#c75c4b");
  });

  it("dark --color-primary 保持品牌蓝,不得被珊瑚红污染", () => {
    const match = blockBody(".theme-dark").match(/--color-primary\s*:\s*(#[0-9a-f]{3,8})/i);
    expect(match?.[1]?.toLowerCase()).not.toBe("#c75c4b");
  });

  it("--bg-autumn 仅在 theme-girl 声明且指向 autumn-bg.png(美术资产防误删)", () => {
    expect(/--bg-autumn\s*:[^;]*autumn-bg\.png/i.test(blockBody(".theme-girl"))).toBe(true);
    expect(/--bg-autumn\s*:\s*url/i.test(blockBody(".theme-light"))).toBe(false);
    expect(/--bg-autumn\s*:\s*url/i.test(blockBody(".theme-dark"))).toBe(false);
  });

  it("girl 玻璃质感 --backdrop-blur 保留,light/dark 无模糊", () => {
    expect(/--backdrop-blur\s*:\s*blur/i.test(blockBody(".theme-girl"))).toBe(true);
    expect(/--backdrop-blur\s*:\s*none/i.test(blockBody(".theme-light"))).toBe(true);
    expect(/--backdrop-blur\s*:\s*none/i.test(blockBody(".theme-dark"))).toBe(true);
  });
});
