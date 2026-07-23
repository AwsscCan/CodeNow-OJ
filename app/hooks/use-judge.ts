"use client";

import { useCallback, useState } from "react";
import type { Result, SubmissionRecord, TestCase } from "../stores/problem-store";

type JudgeOptions = {
  sourceCode: string;
  tests: TestCase[];
  problemId: string;
  problemTitle: string;
  onMascotReact: (results: Result[]) => void;
};

export function useJudge() {
  const [running, setRunning] = useState(false);

  const runTests = useCallback(async (options: JudgeOptions & { submit?: boolean }) => {
    const { sourceCode, tests, problemId, problemTitle, submit, onMascotReact } = options;
    setRunning(true);

    try {
      const response = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceCode, tests }),
      });
      const data = await response.json() as { results?: Result[]; error?: string };
      if (!response.ok || !data.results) throw new Error(data.error || "C++ 判题服务暂不可用");
      const results = data.results;
      const diagnostic = results.find((r) => r.status === "CE")?.actual || "";

      let submission: SubmissionRecord | null = null;
      if (submit) {
        const ok = results.filter((r) => r.status === "AC").length;
        onMascotReact(results);
        const record: SubmissionRecord = {
          id: crypto.randomUUID(),
          problemId,
          problemTitle,
          status: ok === results.length ? "答案正确" : "未通过",
          passed: `${ok}/${results.length}`,
          sourceCode,
          submittedAt: new Date().toISOString(),
        };
        try {
          const saveResponse = await fetch("/api/submissions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(record),
          });
          const saved = await saveResponse.json() as { record?: SubmissionRecord; error?: string };
          if (!saveResponse.ok || !saved.record) throw new Error(saved.error || "保存提交记录失败");
          submission = saved.record;
        } catch (saveError) {
          throw new Error(
            `${ok === results.length ? "答案正确" : `通过 ${ok}/${results.length}`}，但${saveError instanceof Error ? saveError.message : "保存提交记录失败"}`,
          );
        }
      }

      return { results, diagnostic, submission };
    } finally {
      setRunning(false);
    }
  }, []);

  return { running, runTests };
}
