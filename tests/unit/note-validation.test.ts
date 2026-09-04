import { describe, expect, it } from "vitest";
import { getNoteTitleError } from "../../app/lib/note-validation";

describe("笔记标题校验", () => {
  it("空标题返回发布失败提示", () => {
    expect(getNoteTitleError("  ", true)).toBe("发布失败：请先填写笔记标题");
  });

  it("空标题返回保存失败提示", () => {
    expect(getNoteTitleError("\n", false)).toBe("保存失败：请先填写笔记标题");
  });

  it("有效标题不产生错误", () => {
    expect(getNoteTitleError("解题笔记", true)).toBeNull();
  });
});
