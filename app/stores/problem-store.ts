"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type TestCase = { id: number; input: string; output: string; category?: string; scale?: number; targets?: string; reason?: string };
type Problem = {
  id: string;
  title: string;
  difficulty: "入门" | "普及" | "提高";
  time: string;
  memory: string;
  description: string;
  inputFormat: string;
  outputFormat: string;
  samples: TestCase[];
  sourceUrl?: string;
  extractionStatus?: "complete" | "needs_review";
};
type Result = { id: number; status: "AC" | "WA" | "RE" | "CE" | "TLE"; actual: string; expected: string; duration: number };
type SubmissionRecord = { id: string; problemId: string; problemTitle: string; status: string; passed: string; sourceCode: string; submittedAt: string };

export type { Problem, Result, SubmissionRecord, TestCase };

export const STARTER_CODE = `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    long long a, b;
    cin >> a >> b;
    cout << a + b << '\\n';
    return 0;
}`;

export const INITIAL_PROBLEM: Problem = {
  id: "P1001",
  title: "A + B Problem",
  difficulty: "入门",
  time: "1000 ms",
  memory: "128 MB",
  description: "给定两个整数 a 和 b，请计算并输出它们的和。",
  inputFormat: "一行，包含两个以空格分隔的整数 a 和 b。",
  outputFormat: "输出一个整数，表示 a + b 的结果。",
  samples: [
    { id: 1, input: "1 2", output: "3" },
    { id: 2, input: "100 -27", output: "73" },
    { id: 3, input: "999999 1", output: "1000000" },
  ],
};

type ProblemStore = {
  problem: Problem;
  code: string;
  results: Result[];
  compilerDiagnostic: string;
  tab: "problem" | "tests";
  consoleTab: "results" | "history";
  history: SubmissionRecord[];
  historyLoading: boolean;
  selectedSubmission: SubmissionRecord | null;
  workspaceSplit: number;
  cursor: { line: number; column: number };
  notice: string;

  setProblem: (problem: Problem) => void;
  setCode: (code: string) => void;
  setResults: (results: Result[]) => void;
  setCompilerDiagnostic: (d: string) => void;
  setTab: (tab: "problem" | "tests") => void;
  setConsoleTab: (tab: "results" | "history") => void;
  setHistory: (history: SubmissionRecord[]) => void;
  setHistoryLoading: (v: boolean) => void;
  setSelectedSubmission: (s: SubmissionRecord | null) => void;
  setWorkspaceSplit: (v: number) => void;
  setCursor: (line: number, column: number) => void;
  setNotice: (msg: string) => void;
  addTest: () => void;
  updateTest: (id: number, field: "input" | "output", value: string) => void;
  updateTestCategory: (id: number, category: string) => void;
  resetCode: () => void;
};

export const useProblemStore = create<ProblemStore>()(
  persist(
    (set, get) => ({
      problem: INITIAL_PROBLEM,
      code: STARTER_CODE,
      results: [],
      compilerDiagnostic: "",
      tab: "problem" as const,
      consoleTab: "results" as const,
      history: [],
      historyLoading: false,
      selectedSubmission: null,
      workspaceSplit: 46,
      cursor: { line: 1, column: 1 },
      notice: "",

      setProblem: (problem) => set({ problem }),
      setCode: (code) => { set({ code, compilerDiagnostic: "" }); },
      setResults: (results) => set({ results }),
      setCompilerDiagnostic: (compilerDiagnostic) => set({ compilerDiagnostic }),
      setTab: (tab) => set({ tab }),
      setConsoleTab: (consoleTab) => set({ consoleTab }),
      setHistory: (history) => set({ history }),
      setHistoryLoading: (historyLoading) => set({ historyLoading }),
      setSelectedSubmission: (selectedSubmission) => set({ selectedSubmission }),
      setWorkspaceSplit: (workspaceSplit) => set({ workspaceSplit }),
      setCursor: (line, column) => set((s) => s.cursor.line === line && s.cursor.column === column ? s : { cursor: { line, column } }),
      setNotice: (notice) => set({ notice }),

      addTest: () => set((s) => ({
        problem: { ...s.problem, samples: [...s.problem.samples, { id: Date.now(), input: "", output: "" }] },
      })),
      updateTest: (id, field, value) => set((s) => ({
        problem: {
          ...s.problem,
          samples: s.problem.samples.map((t) => t.id === id ? { ...t, [field]: value } : t),
        },
      })),
      updateTestCategory: (id, category) => set((s) => ({
        problem: {
          ...s.problem,
          samples: s.problem.samples.map((t) => t.id === id ? { ...t, category } : t),
        },
      })),
      resetCode: () => set({ code: STARTER_CODE, compilerDiagnostic: "" }),
    }),
    {
      name: "codenow-workspace",
      partialize: (s) => ({
        problem: s.problem,
        code: s.code,
        workspaceSplit: s.workspaceSplit,
      }),
    },
  ),
);
