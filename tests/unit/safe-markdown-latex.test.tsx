// @vitest-environment jsdom
 
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SafeMarkdown } from "../../app/components/notes/safe-markdown";

afterEach(cleanup);

describe("SafeMarkdown LaTeX 公式渲染(KaTeX 按需)", () => {
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
});
