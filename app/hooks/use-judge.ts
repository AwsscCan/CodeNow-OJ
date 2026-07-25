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

    const record: SubmissionRecord = {
      id: crypto.randomUUID(),
      problemId,
      problemTitle,
      status: "判题中",
      passed: "0/0",
      sourceCode,
      submittedAt: new Date().toISOString(),
    };

    try {
      const response = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceCode, tests }),
      });
      const data = await response.json() as { results?: Result[]; error?: string };
      if (!response.ok || !data.results) {
        record.status = "判题失败";
        record.passed = "0/0";
        await saveRecord(record).catch(() => {});
        throw new Error(data.error || "C++ 判题服务暂时不可用");
      }

      const results = data.results;
      const diagnostic = results.find((r) => r.status === "CE")?.actual || "";
      const ok = results.filter((r) => r.status === "AC").length;
      record.status = ok === results.length ? "答案正确" : "未通过";
      record.passed = `${ok}/${results.length}`;

      if (submit) onMascotReact(results);

      let savedRecord = record;
      try {
        savedRecord = await saveRecord(record);
      } catch (saveError) {
        console.warn("保存提交记录失败，但判题结果已保留在当前页面。", saveError);
      }

      return { results, diagnostic, submission: savedRecord };
    } catch (error) {
      if (record.status === "判题中") {
        record.status = "判题失败";
        record.passed = "0/0";
        await saveRecord(record).catch(() => {});
      }
      throw error;
    } finally {
      setRunning(false);
    }
  }, []);

  return { running, runTests };
}

async function saveRecord(record: SubmissionRecord): Promise<SubmissionRecord> {
  const res = await fetch("/api/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
  const data = await res.json() as { record?: SubmissionRecord; error?: string };
  if (!res.ok || !data.record) throw new Error(data.error || "保存提交记录失败");
  return data.record;
}
