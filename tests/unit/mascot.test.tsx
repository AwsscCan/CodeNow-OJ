// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest 要求环境指令先于 import。 */
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
});
