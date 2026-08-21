"use client";

import { create } from "zustand";
import { classifyResults, pickLocalLine, MASCOT_LINE_POOL, type MascotLine, type MascotPhase } from "./mascot-lines";
import type { MemoryEntry, RiskKind } from "./memory-store";
import type { Result } from "./problem-store";

/** recentLines 去重窗口上限，防止台词长期重复又不无限增长 */
export const MASCOT_RECENT_LIMIT = 12;

/** 供台词生成参考的当前编程上下文 */
export type MascotContext = {
  problemTitle: string;
  codeExcerpt: string;
  passed: number;
  total: number;
  firstFailedIndex: number;
  lastStatus: string;
};

export type MascotLearningFeedback = {
  summary: string;
  nextStep: string;
};

const FEEDBACK_RISKS: Partial<Record<MascotPhase, RiskKind[]>> = {
  wa: ["boundary", "output", "statement"],
  ce: ["compile"],
  re: ["runtime", "boundary"],
  tle: ["complexity"],
};

function compactMemoryText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized;
}

function recentRelevantMemory(phase: MascotPhase, memories: readonly MemoryEntry[]) {
  const usable = memories
    .filter((memory) => !memory.muted && compactMemoryText(memory.text).length > 0)
    .slice()
    .reverse();
  const risks = FEEDBACK_RISKS[phase];
  return usable.find((memory) => !risks || !memory.risk || risks.includes(memory.risk)) ?? usable[0];
}

/** 从当前判题状态与未静音记忆派生一条可关闭的本地学习反馈，不写入任何用户数据。 */
export function buildMascotLearningFeedback(
  phase: MascotPhase,
  context: MascotContext,
  memories: readonly MemoryEntry[],
): MascotLearningFeedback {
  if (context.total <= 0) {
    return {
      summary: "本次还没有可用的评测结果。",
      nextStep: "先运行样例，留下可核对的结果。",
    };
  }

  const fallbackNextStep: Record<MascotPhase, string> = {
    idle: "先运行样例，留下可核对的结果。",
    coding: "先运行样例，留下可核对的结果。",
    judging: "等评测完成后，再根据首个失败点复核。",
    ac: "用一个边界样例再核对实现。",
    wa: `先复核第 ${context.firstFailedIndex + 1} 个未通过点的边界和输出。`,
    ce: "先从第一条编译提示开始修正。",
    re: "先检查数组下标、空值和边界。",
    tle: "先估算当前做法的时间复杂度。",
  };
  const summary: Record<MascotPhase, string> = {
    idle: `本次已有 ${context.passed}/${context.total} 个测试点通过。`,
    coding: `本次已有 ${context.passed}/${context.total} 个测试点通过。`,
    judging: `本次已有 ${context.passed}/${context.total} 个测试点通过。`,
    ac: `本次 ${context.passed}/${context.total} 个测试点通过。`,
    wa: `本次 ${context.passed}/${context.total} 个测试点通过，第 ${context.firstFailedIndex + 1} 个未通过。`,
    ce: "本次评测停在编译阶段。",
    re: "本次评测出现运行错误。",
    tle: "本次评测超过时间限制。",
  };
  const memory = recentRelevantMemory(phase, memories);

  return {
    summary: summary[phase],
    nextStep: memory ? `复核近期记录：${compactMemoryText(memory.text)}` : fallbackNextStep[phase],
  };
}

type MascotState = {
  phase: MascotPhase;
  line: MascotLine;
  context: MascotContext;
  aiSolveRequestId: number;
  learningFeedbackRequestId: number;
  dismissedLearningFeedbackRequestId: number;
  recentLines: string[];
  setPhase: (phase: MascotPhase) => void;
  setContext: (patch: Partial<MascotContext>) => void;
  setLine: (line: MascotLine) => void;
  reactToJudge: (results: Result[], opts?: { submit?: boolean }) => void;
  dismissLearningFeedback: () => void;
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
  learningFeedbackRequestId: 0,
  dismissedLearningFeedbackRequestId: 0,
  // 初始台词也计入去重窗口，保证首次点击换台词必出新句
  recentLines: [INITIAL_LINE.text],
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
      learningFeedbackRequestId: s.learningFeedbackRequestId + 1,
    }));
  },
  dismissLearningFeedback: () => set((s) => ({ dismissedLearningFeedbackRequestId: s.learningFeedbackRequestId })),
  requestAiSolve: () => set((s) => ({ aiSolveRequestId: s.aiSolveRequestId + 1 })),
  reset: () => set({
    phase: "idle",
    line: INITIAL_LINE,
    context: INITIAL_CONTEXT,
    aiSolveRequestId: 0,
    learningFeedbackRequestId: 0,
    dismissedLearningFeedbackRequestId: 0,
    recentLines: [INITIAL_LINE.text],
  }),
}));
