// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MascotWrapper } from "../../app/components/mascot-wrapper";
import { useMascotStore } from "../../app/stores/mascot-store";
import { useMemoryStore, type MemoryEntry } from "../../app/stores/memory-store";
import { useThemeStore } from "../../app/stores/theme-store";

const mascotLine = vi.hoisted(() => ({ refresh: vi.fn(), useHook: vi.fn() }));

vi.mock("../../app/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: null, isPending: false }),
  },
}));

vi.mock("../../app/hooks/use-mascot-line", () => ({
  useMascotLine: () => {
    mascotLine.useHook();
    return mascotLine;
  },
}));

function result(status: "AC" | "WA", id: number) {
  return { id, status, duration: 1, expected: "", actual: "" };
}

function memory(text: string, muted = false): MemoryEntry {
  return {
    id: text,
    kind: "habit",
    text,
    count: 1,
    updatedAt: "2026-07-28T00:00:00.000Z",
    risk: "boundary",
    muted,
  };
}

beforeEach(() => {
  localStorage.clear();
  mascotLine.refresh.mockClear();
  mascotLine.useHook.mockClear();
  useThemeStore.setState({ themeMode: "light", editorTheme: "dark" });
  useMascotStore.getState().reset();
  useMemoryStore.setState({
    memories: [],
    memoryScope: { accountId: null, sessionId: "anonymous" },
    memoryScopeHydrated: true,
    memoryScopeHydrating: false,
  });
});

afterEach(() => {
  cleanup();
  useThemeStore.setState({ themeMode: "light", editorTheme: "dark" });
  useMascotStore.getState().reset();
});

describe("MascotWrapper 学习反馈卡", () => {
  it("判题后在少女主题显示本次学习反馈，并只读取未静音记忆作为下一步建议", () => {
    useThemeStore.setState({ themeMode: "girl" });
    useMemoryStore.setState({
      memories: [memory("已静音的边界记录", true), memory("常漏掉空数组边界")],
    });
    act(() => {
      useMascotStore.getState().reactToJudge([result("AC", 1), result("WA", 2)]);
    });

    const { container } = render(<MascotWrapper />);

    expect(screen.getByText("本次学习反馈")).toBeTruthy();
    expect(screen.getByText("本次 1/2 个测试点通过，第 2 个未通过。")).toBeTruthy();
    expect(screen.getByText("下一步：复核近期记录：常漏掉空数组边界")).toBeTruthy();
    expect(screen.queryByText(/已静音的边界记录/)).toBeNull();
    const card = container.querySelector(".mascot-learning-feedback") as HTMLElement;
    expect(card.parentElement?.classList.contains("desktop-mascot")).toBe(true);
    expect(card.style.position).toBe("absolute");
    expect(card.style.maxHeight).toBe("100px");
    expect(card.style.overflow).toBe("hidden");
    expect(card.style.overflowWrap).toBe("anywhere");
  });

  it("关闭反馈卡不隐藏人物，下一次判题会再次触发", () => {
    useThemeStore.setState({ themeMode: "girl" });
    act(() => {
      useMascotStore.getState().reactToJudge([result("WA", 1)]);
    });
    const { container } = render(<MascotWrapper />);

    fireEvent.click(screen.getByLabelText("关闭本次学习反馈"));
    expect(screen.queryByText("本次学习反馈")).toBeNull();
    expect(container.querySelector(".mascot-character")).toBeTruthy();

    act(() => {
      useMascotStore.getState().reactToJudge([result("AC", 1)]);
    });
    expect(screen.getByText("本次学习反馈")).toBeTruthy();
  });

  it("空判题结果使用确定的本地降级建议", () => {
    useThemeStore.setState({ themeMode: "girl" });
    act(() => {
      useMascotStore.getState().reactToJudge([]);
    });

    render(<MascotWrapper />);

    expect(screen.getByText("本次还没有可用的评测结果。")).toBeTruthy();
    expect(screen.getByText("下一步：先运行样例，留下可核对的结果。")).toBeTruthy();
  });

  it("非少女主题隔离桌宠与学习反馈，不发起台词请求", () => {
    act(() => {
      useMascotStore.getState().reactToJudge([result("WA", 1)]);
    });

    const { container } = render(<MascotWrapper />);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByText("本次学习反馈")).toBeNull();
    expect(mascotLine.useHook).not.toHaveBeenCalled();
    expect(mascotLine.refresh).not.toHaveBeenCalled();
  });
});
