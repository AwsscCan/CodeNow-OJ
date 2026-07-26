// @vitest-environment jsdom
 
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopMascot, isInsideDropZone, droppedInsideEditor } from "../../app/components/mascot";

afterEach(cleanup);

function rect(left: number, top: number, right: number, bottom: number): DOMRect {
  return { left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

describe("isInsideDropZone", () => {
  it("点落在矩形内返回 true", () => {
    expect(isInsideDropZone(50, 50, rect(0, 0, 100, 100))).toBe(true);
  });
  it("点落在矩形外返回 false", () => {
    expect(isInsideDropZone(150, 50, rect(0, 0, 100, 100))).toBe(false);
  });
  it("无矩形返回 false", () => {
    expect(isInsideDropZone(50, 50, null)).toBe(false);
  });
});

describe("droppedInsideEditor", () => {
  it("桌宠中心落在投放区内判定命中", () => {
    const zone = document.createElement("div");
    zone.setAttribute("data-mascot-drop-zone", "editor");
    zone.getBoundingClientRect = () => rect(0, 0, 1000, 1000);
    document.body.appendChild(zone);
    const node = document.createElement("aside");
    node.getBoundingClientRect = () => rect(400, 400, 600, 600);
    expect(droppedInsideEditor(node)).toBe(true);
    document.body.removeChild(zone);
  });

  it("桌宠远离投放区判定未命中", () => {
    const zone = document.createElement("div");
    zone.setAttribute("data-mascot-drop-zone", "editor");
    zone.getBoundingClientRect = () => rect(0, 0, 100, 100);
    document.body.appendChild(zone);
    const node = document.createElement("aside");
    node.getBoundingClientRect = () => rect(800, 800, 900, 900);
    expect(droppedInsideEditor(node)).toBe(false);
    document.body.removeChild(zone);
  });

  it("页面无投放区时返回 false", () => {
    const node = document.createElement("aside");
    node.getBoundingClientRect = () => rect(0, 0, 10, 10);
    expect(droppedInsideEditor(node)).toBe(false);
  });

  it("节点为空返回 false", () => {
    expect(droppedInsideEditor(null)).toBe(false);
  });
});

describe("DesktopMascot 渲染", () => {
  const baseProps = {
    visible: true,
    message: "又 WA 啦，ふふ",
    mood: "annoyed" as const,
    sprite: 4,
    onCycle: vi.fn(),
    onSetVisible: vi.fn(),
  };

  it("显示 store 提供的台词与情绪样式", () => {
    const { container } = render(<DesktopMascot {...baseProps} />);
    expect(container.querySelector(".mascot-bubble")?.textContent).toContain("又 WA 啦");
    expect(container.querySelector(".mood-annoyed")).toBeTruthy();
  });

  it("点击气泡触发 onCycle 换台词", () => {
    const onCycle = vi.fn();
    const { container } = render(<DesktopMascot {...baseProps} onCycle={onCycle} />);
    fireEvent.click(container.querySelector(".mascot-bubble")!);
    expect(onCycle).toHaveBeenCalled();
  });

  it("点击关闭按钮隐藏桌宠", () => {
    const onSetVisible = vi.fn();
    render(<DesktopMascot {...baseProps} onSetVisible={onSetVisible} />);
    fireEvent.click(screen.getByLabelText("暂时隐藏桌宠"));
    expect(onSetVisible).toHaveBeenCalledWith(false);
  });

  it("不可见时渲染召回胶囊", () => {
    const onSetVisible = vi.fn();
    render(<DesktopMascot {...baseProps} visible={false} onSetVisible={onSetVisible} />);
    fireEvent.click(screen.getByText("召回伙伴"));
    expect(onSetVisible).toHaveBeenCalledWith(true);
  });

  it("换台词时人物节点重建，one-shot 动作动画得以重放", () => {
    const { container, rerender } = render(<DesktopMascot {...baseProps} message="第一句" />);
    const before = container.querySelector(".mascot-character");
    rerender(<DesktopMascot {...baseProps} message="第二句" />);
    const after = container.querySelector(".mascot-character");
    expect(after, "换台词后应有新的人物节点以重放动画").not.toBe(before);
    expect(after).toBeTruthy();
  });
});

describe("DesktopMascot 拖拽状态机", () => {
  const baseProps = {
    visible: true,
    message: "台词",
    mood: "smile" as const,
    sprite: 0,
    onCycle: vi.fn(),
    onSetVisible: vi.fn(),
  };

  it("按下后立刻抬起(未拖动)不残留 dragging 态", () => {
    const { container } = render(<DesktopMascot {...baseProps} />);
    const character = container.querySelector(".mascot-character")!;
    fireEvent.pointerDown(character, { button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(window);
    expect(container.querySelector(".desktop-mascot")!.classList.contains("dragging"), "dragging 态未复位").toBe(false);
  });

  it("未拖动的抬起上报 onDragDrop(false, false)，不误触发比试", () => {
    const onDragDrop = vi.fn();
    const { container } = render(<DesktopMascot {...baseProps} onDragDrop={onDragDrop} />);
    fireEvent.pointerDown(container.querySelector(".mascot-character")!, { button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(window);
    expect(onDragDrop).toHaveBeenCalledWith(false, false);
  });

  it("拖动后落在编辑区上报 onDragDrop(true, true)", () => {
    const zone = document.createElement("div");
    zone.setAttribute("data-mascot-drop-zone", "editor");
    zone.getBoundingClientRect = () => ({ left: -500, top: -500, right: 1500, bottom: 1500, width: 2000, height: 2000, x: -500, y: -500, toJSON: () => ({}) } as DOMRect);
    document.body.appendChild(zone);
    const onDragDrop = vi.fn();
    const { container } = render(<DesktopMascot {...baseProps} onDragDrop={onDragDrop} />);
    fireEvent.pointerDown(container.querySelector(".mascot-character")!, { button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(window, { clientX: 150, clientY: 150 });
    fireEvent.pointerUp(window);
    expect(onDragDrop).toHaveBeenCalledWith(true, true);
    document.body.removeChild(zone);
  });
});
