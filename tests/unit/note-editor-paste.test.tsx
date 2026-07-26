// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest 要求环境指令先于 import。 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/components/notes/problem-ref-picker", () => ({ ProblemRefPicker: () => null }));

import { NoteEditor, type NoteEditorValue } from "../../app/components/notes/note-editor";

const baseValue: NoteEditorValue = {
  title: "解题笔记", content: "正文", summary: "", tags: [], visibility: "private", problemRefs: [],
};

function pasteData(file: File) {
  return { clipboardData: { items: [{ kind: "file", type: file.type, getAsFile: () => file }] } };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("笔记编辑器粘贴图片", () => {
  it("粘贴小图自动插入 data URL 图片语法", async () => {
    const onChange = vi.fn();
    const { container } = render(<NoteEditor value={baseValue} onChange={onChange} onSubmit={vi.fn()} submitLabel="保存" />);
    const textarea = container.querySelector(".note-editor-split textarea")!;
    const file = new File([new Uint8Array([137, 80, 78, 71])], "fig.png", { type: "image/png" });
    fireEvent.paste(textarea, pasteData(file));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
      const next = onChange.mock.calls[onChange.mock.calls.length - 1][0] as NoteEditorValue;
      expect(next.content).toContain("![插图](data:image/png;base64,");
    });
  });

  it("超限图片显示持久错误提示，不写入正文", async () => {
    const onChange = vi.fn();
    const { container } = render(<NoteEditor value={baseValue} onChange={onChange} onSubmit={vi.fn()} submitLabel="保存" />);
    const textarea = container.querySelector(".note-editor-split textarea")!;
    const big = new File([new Uint8Array(301 * 1024)], "huge.png", { type: "image/png" });
    fireEvent.paste(textarea, pasteData(big));
    await waitFor(() => {
      expect(container.querySelector(".paste-error")?.textContent).toMatch(/300\s*KB|外链/);
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
