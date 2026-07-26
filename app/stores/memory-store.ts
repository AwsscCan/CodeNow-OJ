/* CodeNow OJ · 用户记忆池(习惯与错误沉淀，反哺 AI 对话与桌宠台词) · Bamzc */

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Result } from "./problem-store";

/** 记忆池容量上限：超限淘汰最旧，防止 localStorage 无限膨胀 */
export const MEMORY_LIMIT = 40;

export type MemoryKind = "mistake" | "habit";
export type MemoryEntry = { id: string; kind: MemoryKind; text: string; count: number; updatedAt: string };

type MemoryStore = {
  memories: MemoryEntry[];
  remember: (kind: MemoryKind, text: string) => void;
  recentMemories: (limit: number) => string[];
  clearMemories: () => void;
};

/**
 * 从一次判题结果沉淀错误记忆：只记失败(全 AC 不立传)。
 * 文案保持事实性，供 AI 自然引用。
 */
export function distillJudgeMemory(problem: { id: string; title: string }, results: Result[]): { kind: MemoryKind; text: string } | null {
  if (!results.length) return null;
  const passed = results.filter((r) => r.status === "AC").length;
  const label = `「${problem.id} ${problem.title}」`;
  if (results.some((r) => r.status === "CE")) return { kind: "mistake", text: `在${label}编译失败过，语法细节容易疏忽` };
  if (passed === results.length) return null;
  if (results.some((r) => r.status === "TLE")) return { kind: "mistake", text: `在${label}超时过，倾向先写暴力解法` };
  if (results.some((r) => r.status === "RE")) return { kind: "mistake", text: `在${label}运行崩溃过，数组越界/边界防护是弱点` };
  const firstFailed = results.findIndex((r) => r.status !== "AC");
  return { kind: "mistake", text: `在${label}WA 过(${passed}/${results.length})，第 ${firstFailed + 1} 个点先挂` };
}

const QUESTION_PATTERNS: Array<{ pattern: RegExp; text: string }> = [
  { pattern: /边界|corner|特殊情况|极端/, text: "常在边界情况上没把握，提问多与边界有关" },
  { pattern: /超时|TLE|复杂度|太慢|优化/i, text: "常被复杂度与超时困扰" },
  { pattern: /思路|怎么做|怎么想|入手|无从下手/, text: "习惯先问整体思路再动手" },
  { pattern: /报错|编译|error|CE/i, text: "常被编译报错卡住" },
  { pattern: /看不懂|不理解|什么意思|读不懂/, text: "偏好把题意掰开揉碎地讲" },
];

/** 从一条用户提问沉淀提问习惯，无可识别模式时返回 null */
export function distillQuestionMemory(question: string): { kind: MemoryKind; text: string } | null {
  const hit = QUESTION_PATTERNS.find((p) => p.pattern.test(question));
  return hit ? { kind: "habit", text: hit.text } : null;
}

export const useMemoryStore = create<MemoryStore>()(
  persist(
    (set, get) => ({
      memories: [],
      remember: (kind, text) => set((s) => {
        const trimmed = text.trim();
        if (!trimmed) return s;
        const existing = s.memories.find((m) => m.text === trimmed);
        const rest = s.memories.filter((m) => m.text !== trimmed);
        const entry: MemoryEntry = existing
          ? { ...existing, count: existing.count + 1, updatedAt: new Date().toISOString() }
          : { id: crypto.randomUUID(), kind, text: trimmed, count: 1, updatedAt: new Date().toISOString() };
        return { memories: [...rest, entry].slice(-MEMORY_LIMIT) };
      }),
      recentMemories: (limit) => get().memories
        .slice(-Math.max(0, limit))
        .map((m) => (m.count > 1 ? `${m.text}（已出现 ${m.count} 次）` : m.text)),
      clearMemories: () => set({ memories: [] }),
    }),
    {
      name: "codenow-user-memory",
      partialize: (s) => ({ memories: s.memories }),
    },
  ),
);
