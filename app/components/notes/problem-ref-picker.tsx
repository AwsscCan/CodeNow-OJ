"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { authClient } from "../../lib/auth-client";
import type { NoteProblemKind } from "../../lib/note-api";
import { ProblemApi, type CloudProblemSummary } from "../../lib/problem-api";
import { getAcwingProblems, loadAcwingCatalog, useLibraryStore } from "../../stores/library-store";
import { INITIAL_PROBLEM } from "../../stores/problem-store";

export type PickedProblem = { problemCode: string; title: string; problemKind: NoteProblemKind; problemRef: string; difficulty: string; local: boolean };

/**
 * 从题库选题插入正文引用。
 * 本地/内置/AcWing 题库免登录（problemKind='public'，problemRef=题号）；
 * 登录后额外加载云端私有题库（problemKind='private'，problemRef=云端 UUID）。
 */
export function ProblemRefPicker({ open, onClose, onPick }: {
  open: boolean;
  onClose: () => void;
  onPick: (problem: PickedProblem) => void;
}) {
  const session = authClient.useSession();
  const loggedIn = Boolean(session.data?.user);
  const archives = useLibraryStore((state) => state.archives);
  const [cloud, setCloud] = useState<CloudProblemSummary[]>([]);
  const [search, setSearch] = useState("");
  const [acwingReady, setAcwingReady] = useState(0);
  const acwingStarted = useRef(false);

  useEffect(() => {
    if (!open || acwingStarted.current) return;
    acwingStarted.current = true;
    void loadAcwingCatalog().then(() => setAcwingReady((value) => value + 1));
  }, [open]);

  useEffect(() => {
    if (!open || !loggedIn) return;
    let active = true;
    ProblemApi.list().then((result) => { if (active) setCloud(result.problems); }).catch(() => { /* 离线仅用本地题库 */ });
    return () => { active = false; };
  }, [open, loggedIn]);

  const entries = useMemo<PickedProblem[]>(() => {
    void acwingReady;
    const local: PickedProblem[] = [
      { problemCode: INITIAL_PROBLEM.id, title: INITIAL_PROBLEM.title, problemKind: "public", problemRef: INITIAL_PROBLEM.id, difficulty: INITIAL_PROBLEM.difficulty, local: true },
      ...archives.map((item) => ({ problemCode: item.problem.id, title: item.problem.title, problemKind: "public" as const, problemRef: item.problem.id, difficulty: item.problem.difficulty, local: true })),
      ...getAcwingProblems().map((item) => ({ problemCode: item.id, title: item.title, problemKind: "public" as const, problemRef: item.id, difficulty: item.difficulty, local: true })),
    ];
    const cloudEntries: PickedProblem[] = cloud.map((item) => ({ problemCode: item.problemCode, title: item.title, problemKind: "private" as const, problemRef: item.id, difficulty: item.difficulty, local: false }));
    const seen = new Set<string>();
    return [...cloudEntries, ...local].filter((entry) => {
      const key = `${entry.problemKind}:${entry.problemRef}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [archives, cloud, acwingReady]);

  if (!open) return null;

  const filtered = entries.filter((entry) => !search || `${entry.problemCode} ${entry.title}`.toLowerCase().includes(search.toLowerCase())).slice(0, 200);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal rename-modal" onClick={(event) => event.stopPropagation()}>
        <span className="modal-kicker">从题库选题</span>
        <label>搜索题目
          <input autoFocus placeholder="题号或标题" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <div style={{ maxHeight: "46vh", overflow: "auto", marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.length === 0 ? <small>没有匹配的题目。{loggedIn ? "" : "登录后可加载云端题库。"}</small> : null}
          {filtered.map((entry) => (
            <button
              key={`${entry.problemKind}:${entry.problemRef}`}
              type="button"
              className="problem-ref-card"
              style={{ justifyContent: "space-between", width: "100%" }}
              onClick={() => { onPick(entry); onClose(); }}
            >
              <span><b>{entry.problemCode}</b> {entry.title}</span>
              <span>{entry.local ? "本地" : "云端"} · {entry.difficulty}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
