// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest 要求环境指令先于 import。 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requestMascotLine } = vi.hoisted(() => ({ requestMascotLine: vi.fn() }));
vi.mock("../../app/lib/mascot-line-api", () => ({ requestMascotLine }));

import { useMascotLine } from "../../app/hooks/use-mascot-line";
import { useAiStore } from "../../app/stores/ai-store";
import { MASCOT_LINE_POOL } from "../../app/stores/mascot-lines";
import { useMascotStore } from "../../app/stores/mascot-store";
import { useMemoryStore } from "../../app/stores/memory-store";

const AI_LINE = { text: "AI 生成的调侃台词", mood: "smug" as const, sprite: 2 };

beforeEach(() => {
  useMascotStore.getState().reset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useMascotLine 点击即时反馈", () => {
  it("配置了 AI Key 时点击立即换本地台词，AI 台词回来后再覆盖", async () => {
    useAiStore.getState().setApiKey("deepseek", "sk-with-key");
    let resolveAi: (line: typeof AI_LINE) => void;
    requestMascotLine.mockImplementation(() => new Promise((resolve) => { resolveAi = resolve; }));

    const initialText = useMascotStore.getState().line.text;
    const { result } = renderHook(() => useMascotLine());
    await act(async () => { void result.current.refresh(); });

    const immediate = useMascotStore.getState().line.text;
    expect(immediate, "点击后应立即换一句本地台词垫场").not.toBe(initialText);
    expect(MASCOT_LINE_POOL.idle.some((l) => l.text === immediate), "垫场句应来自本地台词池").toBe(true);

    await act(async () => { resolveAi!(AI_LINE); });
    await waitFor(() => expect(useMascotStore.getState().line.text).toBe(AI_LINE.text));
  });

  it("未配置 AI Key 时不垫场，直接等取词结果", async () => {
    useAiStore.getState().clearApiKey("deepseek");
    const local = MASCOT_LINE_POOL.idle[1];
    requestMascotLine.mockResolvedValue(local);

    const { result } = renderHook(() => useMascotLine());
    await act(async () => { await result.current.refresh(); });
    expect(useMascotStore.getState().line.text).toBe(local.text);
  });

  it("取词请求携带用户记忆池(桌宠台词可玩记忆梗)", async () => {
    useMemoryStore.setState({ memories: [] });
    useMemoryStore.getState().remember("habit", "常在边界情况上没把握");
    requestMascotLine.mockResolvedValue(MASCOT_LINE_POOL.idle[2]);

    const { result } = renderHook(() => useMascotLine());
    await act(async () => { await result.current.refresh(); });
    const lastCall = requestMascotLine.mock.calls[requestMascotLine.mock.calls.length - 1][0] as { memories?: string[] };
    expect(lastCall.memories, "取词请求应携带记忆池").toBeTruthy();
    expect(lastCall.memories!.some((m: string) => m.includes("边界"))).toBe(true);
  });
});
