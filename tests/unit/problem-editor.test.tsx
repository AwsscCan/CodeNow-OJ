// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest 要求环境指令先于 import。 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProblemEditor } from "../../app/components/problem-editor";
import { INITIAL_PROBLEM } from "../../app/stores/problem-store";

/** 构造带图片文件的粘贴事件载荷 */
function imagePasteData(file: File) {
  return {
    clipboardData: {
      items: [{ kind: "file", type: file.type, getAsFile: () => file }],
    },
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProblemEditor 手动修正 AI 识别错误", () => {
  it("表单预填充当前题面各字段", () => {
    render(<ProblemEditor problem={INITIAL_PROBLEM} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText("题目标题")).toHaveProperty("value", INITIAL_PROBLEM.title);
    expect(screen.getByLabelText("题目描述")).toHaveProperty("value", INITIAL_PROBLEM.description);
    expect(screen.getByLabelText("输入格式")).toHaveProperty("value", INITIAL_PROBLEM.inputFormat);
    expect(screen.getByLabelText("输出格式")).toHaveProperty("value", INITIAL_PROBLEM.outputFormat);
    expect(screen.getByLabelText("难度")).toHaveProperty("value", INITIAL_PROBLEM.difficulty);
    expect(screen.getByLabelText("时间限制")).toHaveProperty("value", INITIAL_PROBLEM.time);
    expect(screen.getByLabelText("内存限制")).toHaveProperty("value", INITIAL_PROBLEM.memory);
  });

  it("修改字段后保存，onSave 收到更新后的题面", () => {
    const onSave = vi.fn();
    render(<ProblemEditor problem={INITIAL_PROBLEM} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("题目标题"), { target: { value: "修正后的标题" } });
    fireEvent.change(screen.getByLabelText("输入格式"), { target: { value: "第一行一个整数 n。" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      title: "修正后的标题",
      inputFormat: "第一行一个整数 n。",
      description: INITIAL_PROBLEM.description,
      samples: INITIAL_PROBLEM.samples,
    }));
  });

  it("标题为空时保存被拒绝并提示", () => {
    const onSave = vi.fn();
    render(<ProblemEditor problem={INITIAL_PROBLEM} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("题目标题"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(document.querySelector(".problem-editor .field-error")).toBeTruthy();
  });

  it("取消时调用 onCancel 且不提交修改", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<ProblemEditor problem={INITIAL_PROBLEM} onSave={onSave} onCancel={onCancel} />);
    fireEvent.change(screen.getByLabelText("题目标题"), { target: { value: "随便改改" } });
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("在题目描述中粘贴图片，自动插入 base64 Markdown 图片语法", async () => {
    render(<ProblemEditor problem={INITIAL_PROBLEM} onSave={vi.fn()} onCancel={vi.fn()} />);
    const textarea = screen.getByLabelText("题目描述") as HTMLTextAreaElement;
    const file = new File([new Uint8Array([137, 80, 78, 71])], "figure.png", { type: "image/png" });
    fireEvent.paste(textarea, imagePasteData(file));
    await waitFor(() => {
      expect(textarea.value, "粘贴后应插入 data URL 图片语法").toContain("![题图](data:image/png;base64,");
      expect(textarea.value).toContain(INITIAL_PROBLEM.description);
    });
  });

  it("粘贴超过 300KB 的图片被拒绝并提示使用外链", async () => {
    render(<ProblemEditor problem={INITIAL_PROBLEM} onSave={vi.fn()} onCancel={vi.fn()} />);
    const textarea = screen.getByLabelText("题目描述") as HTMLTextAreaElement;
    const big = new File([new Uint8Array(301 * 1024)], "huge.png", { type: "image/png" });
    fireEvent.paste(textarea, imagePasteData(big));
    await waitFor(() => {
      expect(document.querySelector(".problem-editor .field-error")?.textContent).toMatch(/300\s*KB|外链/);
    });
    expect(textarea.value).not.toContain("data:image");
  });
});
