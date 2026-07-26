// @vitest-environment jsdom
 
import { fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEscapeClose } from "../../app/hooks/use-escape-close";

describe("useEscapeClose 弹窗 Esc 关闭", () => {
  it("激活时按 Esc 触发 onClose", () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeClose(true, onClose));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("未激活时按 Esc 不触发", () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeClose(false, onClose));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("其它按键不触发", () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeClose(true, onClose));
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("卸载后移除监听", () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useEscapeClose(true, onClose));
    unmount();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
