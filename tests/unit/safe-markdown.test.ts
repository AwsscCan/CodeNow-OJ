// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderMarkdownToSafeHtml } from "../../app/lib/notes/markdown";

describe("SafeMarkdown sanitize pipeline", () => {
  it("strips scripts, iframes, event handlers and dangerous protocols", () => {
    const html = renderMarkdownToSafeHtml([
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(1)>",
      "<iframe src=\"javascript:alert(1)\"></iframe>",
      "[click](javascript:alert(1))",
      "<a href=\"vbscript:msgbox(1)\">x</a>",
      "<div onclick=\"steal()\">hi</div>",
    ].join("\n\n"));

    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<iframe/i);
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/onclick/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/vbscript:/i);
  });

  it("keeps whitelisted markdown formatting", () => {
    const html = renderMarkdownToSafeHtml("# 标题\n\n**粗体** 和 `代码`\n\n- 一\n- 二\n\n```js\nlet a = 1;\n```");
    expect(html).toMatch(/<h1[^>]*>标题<\/h1>/);
    expect(html).toMatch(/<strong>粗体<\/strong>/);
    expect(html).toMatch(/<code[^>]*>代码<\/code>/);
    expect(html).toMatch(/<li>一<\/li>/);
    expect(html).toMatch(/<pre>/);
  });

  it("hardens external links and preserves language classes for highlighting", () => {
    const html = renderMarkdownToSafeHtml("[外链](https://example.com)\n\n```python\nprint(1)\n```");
    expect(html).toMatch(/rel="noopener noreferrer nofollow"/);
    expect(html).toMatch(/target="_blank"/);
    expect(html).toMatch(/href="https:\/\/example\.com"/);
    expect(html).toMatch(/class="language-python"/);
  });

  it("drops non-whitelisted classes but keeps note/problem-ref markers", () => {
    const html = renderMarkdownToSafeHtml("<span class=\"evil problem-ref-card\">卡片</span>");
    expect(html).toMatch(/class="problem-ref-card"/);
    expect(html).not.toMatch(/evil/);
  });
});
