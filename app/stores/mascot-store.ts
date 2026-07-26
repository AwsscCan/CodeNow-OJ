"use client";

import { create } from "zustand";
import { classifyResults, pickLocalLine, MASCOT_LINE_POOL, type MascotLine, type MascotPhase } from "./mascot-lines";
import type { Result } from "./problem-store";

/** recentLines 去重窗口上限，防止台词长期重复又不无限增长 */
export const MASCOT_RECENT_LIMIT = 12;

/** 供台词生成参考的当前编程上下文 */
type MascotContext = {
  problemTitle: string;
  codeExcerpt: string;
  passed: number;
  total: number;
  firstFailedIndex: number;
  lastStatus: string;
};

type MascotState = {
  phase: MascotPhase;
  line: MascotLine;
  context: MascotContext;
  aiSolveRequestId: number;
  recentLines: string[];
  setPhase: (phase: MascotPhase) => void;
  setContext: (patch: Partial<MascotContext>) => void;
  setLine: (line: MascotLine) => void;
  reactToJudge: (results: Result[], opts?: { submit?: boolean }) => void;
  requestAiSolve: () => void;
  reset: () => void;
};

const INITIAL_CONTEXT: MascotContext = { problemTitle: "", codeExcerpt: "", passed: 0, total: 0, firstFailedIndex: -1, lastStatus: "" };
const INITIAL_LINE: MascotLine = MASCOT_LINE_POOL.idle[0];

/** 追加台词并去重，保留最近 MASCOT_RECENT_LIMIT 条；空串不入队 */
function appendRecent(recent: string[], text: string): string[] {
  if (!text?.trim()) return recent;
  return [...recent.filter((item) => item !== text), text].slice(-MASCOT_RECENT_LIMIT);
}

/**
 * 桌宠状态桥：连接全局桌宠与做题页面。
 * 做题页写入上下文/判题反应，桌宠读取台词与表情，并通过 aiSolveRequestId 触发 AI 弹窗。
 */
export const useMascotStore = create<MascotState>((set, get) => ({
  phase: "idle",
  line: INITIAL_LINE,
  context: INITIAL_CONTEXT,
  aiSolveRequestId: 0,
  recentLines: [],
  setPhase: (phase) => set({ phase }),
  setContext: (patch) => set((s) => ({ context: { ...s.context, ...patch } })),
  setLine: (line) => set((s) => ({ line, recentLines: appendRecent(s.recentLines, line.text) })),
  reactToJudge: (results, opts) => {
    const { phase, passed, total, firstFailedIndex } = classifyResults(results);
    const line = pickLocalLine(phase, get().recentLines);
    set((s) => ({
      phase,
      line,
      recentLines: appendRecent(s.recentLines, line.text),
      context: { ...s.context, passed, total, firstFailedIndex, lastStatus: opts?.submit ? "submit" : "run" },
    }));
  },
  requestAiSolve: () => set((s) => ({ aiSolveRequestId: s.aiSolveRequestId + 1 })),
  reset: () => set({ phase: "idle", line: INITIAL_LINE, context: INITIAL_CONTEXT, aiSolveRequestId: 0, recentLines: [] }),
}));
