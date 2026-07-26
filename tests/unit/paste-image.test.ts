// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { PASTE_IMAGE_LIMIT, pasteImageIntoMarkdown } from "../../app/lib/paste-image";

function makeEvent(file: File | null, selection = { start: 0, end: 0 }) {
  return {
    clipboardData: file ? { items: [{ kind: "file", type: file.type, getAsFile: () => file }] } : { items: [] },
    currentTarget: { selectionStart: selection.start, selectionEnd: selection.end },
    preventDefault: vi.fn(),
  } as unknown as React.ClipboardEvent<HTMLTextAreaElement>;
}

describe("pasteImageIntoMarkdown 共享粘贴管线", () => {
  it("非图片粘贴不拦截，返回 false", () => {
    const event = makeEvent(null);
    const handled = pasteImageIntoMarkdown(event, "原文", () => {}, () => {}, "插图");
    expect(handled).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("图片粘贴在光标处插入 data URL Markdown 语法", async () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], "p.png", { type: "image/png" });
    const onInsert = vi.fn();
    const event = makeEvent(file, { start: 2, end: 2 });
    const handled = pasteImageIntoMarkdown(event, "前后", onInsert, () => {}, "插图");
    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(onInsert).toHaveBeenCalled();
      const next = onInsert.mock.calls[0][0] as string;
      expect(next.startsWith("前后".slice(0, 2))).toBe(true);
      expect(next).toContain("![插图](data:image/png;base64,");
    });
  });

  it("超限图片拒绝并报错，不插入", () => {
    const big = new File([new Uint8Array(PASTE_IMAGE_LIMIT + 1)], "big.png", { type: "image/png" });
    const onInsert = vi.fn();
    const onError = vi.fn();
    pasteImageIntoMarkdown(makeEvent(big), "x", onInsert, onError, "插图");
    expect(onError).toHaveBeenCalled();
    expect(String(onError.mock.calls[0][0])).toMatch(/300\s*KB|外链/);
    expect(onInsert).not.toHaveBeenCalled();
  });
});
