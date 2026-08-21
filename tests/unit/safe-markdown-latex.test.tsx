// @vitest-environment jsdom
 
import { cleanup, render, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { SafeMarkdown } from "../../app/components/notes/safe-markdown";
import { renderMarkdownToSafeHtml } from "../../app/lib/notes/markdown";

afterEach(cleanup);

describe("SafeMarkdown LaTeX 公式渲染(KaTeX 按需)", () => {
  it("同步安全渲染函数直接返回 KaTeX HTML", () => {
    const html = renderMarkdownToSafeHtml("值为 $x+1$");

    expect(html).toContain('class="katex"');
    expect(html).not.toContain("$x+1$");
  });

  it("首次客户端渲染已经包含 KaTeX，不暴露公式原文中间态", () => {
    const { container } = render(<SafeMarkdown value="值为 $x+1$" />);

    expect(container.querySelector(".katex")).toBeTruthy();
    expect(container.textContent).not.toContain("$x+1$");
  });

  it("行内公式 $...$ 渲染为 .katex 元素", async () => {
    const { container } = render(<SafeMarkdown value="质能方程 $E=mc^2$ 很经典" />);
    await waitFor(() => {
      expect(container.querySelector(".katex"), "行内公式应渲染为 KaTeX").toBeTruthy();
    }, { timeout: 5000 });
    expect(container.textContent).toContain("质能方程");
  });

  it("块级公式 $$...$$ 渲染为展示模式", async () => {
    const { container } = render(<SafeMarkdown value={"求和公式：\n\n$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$"} />);
    await waitFor(() => {
      expect(container.querySelector(".katex-display"), "块级公式应为展示模式").toBeTruthy();
    }, { timeout: 5000 });
  });

  it("不含 $ 的内容不触发公式渲染", async () => {
    const { container } = render(<SafeMarkdown value="普通文本，没有公式。" />);
    await new Promise((r) => setTimeout(r, 200));
    expect(container.querySelector(".katex")).toBeNull();
  });

  it("代码块中的 $ 不被当作公式", async () => {
    const { container } = render(<SafeMarkdown value={"代码：`echo $HOME` 与 $x+1$"} />);
    await waitFor(() => {
      expect(container.querySelector(".katex"), "代码块外的公式应渲染").toBeTruthy();
    }, { timeout: 5000 });
    const code = container.querySelector("code");
    expect(code?.textContent).toContain("$HOME");
    expect(code?.querySelector(".katex")).toBeNull();
  });

  it("keeps escaped dollar signs literal before a later formula", () => {
    const html = renderMarkdownToSafeHtml("Price: \\$5; math: $x+1$");
    const container = document.createElement("div");
    container.innerHTML = html;

    expect(container.textContent).toContain("Price: $5; math:");
    expect(container.querySelector("annotation")?.textContent).toBe("x+1");
  });

  it("keeps HTML sanitization enforced when KaTeX runs", () => {
    const html = renderMarkdownToSafeHtml("$x$ <img src=x onerror=alert(1)> [bad](javascript:alert(1))");
    const container = document.createElement("div");
    container.innerHTML = html;

    expect(container.querySelector(".katex")).toBeTruthy();
    expect(container.querySelector("script, iframe, img[onerror], a[href^='javascript:']")).toBeNull();
    expect(html).not.toMatch(/\sonerror\s*=/i);
  });

  it("keeps malformed LaTeX from breaking the sanitized fallback", () => {
    const renderInvalidFormula = () => renderMarkdownToSafeHtml("Bad $\\notARealCommand$");

    expect(renderInvalidFormula).not.toThrow();
    const html = renderInvalidFormula();
    const container = document.createElement("div");
    container.innerHTML = html;
    expect(container.textContent).toContain("\\notARealCommand");
    expect(container.querySelector("script, iframe")).toBeNull();
  });

  it("uses a React-escaped fallback during server rendering", () => {
    const html = renderToStaticMarkup(<SafeMarkdown value={'<img src=x onerror=alert(1)> $x$'} />);

    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('class="katex"');
  });
});
