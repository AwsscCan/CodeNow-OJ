"use client";

import { useEffect, useRef, useState } from "react";
import { ProblemApi, type CloudProblemSummary } from "../../lib/problem-api";

export type PickedProblem = { problemCode: string; title: string; cloudId: string; difficulty: string };

/**
 * 从当前用户的云端题库选题，插入正文引用。
 * 私有题以 problemKind='private' + 云端 UUID 记录，正文插入指向 /problem/<code> 的内部链接。
 */
export function ProblemRefPicker({ open, onClose, onPick }: {
  open: boolean;
  onClose: () => void;
  onPick: (problem: PickedProblem) => void;
}) {
  const [problems, setProblems] = useState<CloudProblemSummary[]>([]);
  const [search, setSearch] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const started = useRef(false);

  useEffect(() => {
    if (!open || started.current) return;
    started.current = true;
    const controller = new AbortController();
    ProblemApi.list(controller.signal)
      .then((result) => { setProblems(result.problems); setState("ready"); })
      .catch(() => setState("error"));
    return () => controller.abort();
  }, [open]);

  if (!open) return null;

  const filtered = problems.filter((problem) => !search || `${problem.problemCode} ${problem.title}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal rename-modal" onClick={(event) => event.stopPropagation()}>
        <span className="modal-kicker">从题库选题</span>
        <label>搜索题目
          <input autoFocus placeholder="题号或标题" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <div style={{ maxHeight: "46vh", overflow: "auto", marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {state === "loading" ? <small>加载题库中…</small> : null}
          {state === "error" ? <small>无法加载题库，请先登录并添加题目。</small> : null}
          {state === "ready" && filtered.length === 0 ? <small>没有匹配的题目。</small> : null}
          {filtered.map((problem) => (
            <button
              key={problem.id}
              type="button"
              className="problem-ref-card"
              style={{ justifyContent: "space-between", width: "100%" }}
              onClick={() => { onPick({ problemCode: problem.problemCode, title: problem.title, cloudId: problem.id, difficulty: problem.difficulty }); onClose(); }}
            >
              <span><b>{problem.problemCode}</b> {problem.title}</span>
              <span>{problem.difficulty}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
