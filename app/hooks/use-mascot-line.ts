/* CodeNow OJ · 桌宠台词自动刷新 hook · Bamzc */

"use client";

import { useCallback, useEffect, useRef } from "react";
import { requestMascotLine } from "../lib/mascot-line-api";
import { useAiStore } from "../stores/ai-store";
import { pickLocalLine } from "../stores/mascot-lines";
import { useMascotStore } from "../stores/mascot-store";
import { useMemoryStore } from "../stores/memory-store";

/**
 * 驱动桌宠台词：情境(phase)变化时自动取一句新台词写回 store，
 * 并暴露 refresh 供用户点击桌宠时手动换新。abort 防止旧请求覆盖新台词。
 */
export function useMascotLine() {
  const phase = useMascotStore((s) => s.phase);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const ai = useAiStore.getState();
    // 配置 AI 时上游往返有秒级延迟：先即时换一句本地台词反馈点击，AI 台词回来后再覆盖
    if (ai.configured) {
      const current = useMascotStore.getState();
      current.setLine(pickLocalLine(current.phase, current.recentLines));
    }
    const mascot = useMascotStore.getState();
    const line = await requestMascotLine({
      phase: mascot.phase,
      context: mascot.context,
      recentLines: mascot.recentLines,
      memories: useMemoryStore.getState().recentMemories(3),
      configured: ai.configured,
      signal: controller.signal,
    });
    if (!controller.signal.aborted) useMascotStore.getState().setLine(line);
  }, []);

  useEffect(() => {
    void refresh();
    return () => abortRef.current?.abort();
  }, [phase, refresh]);

  return { refresh };
}
