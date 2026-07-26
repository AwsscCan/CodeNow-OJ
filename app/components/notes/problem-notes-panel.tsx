"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NoteApi, type NoteListEntry, type NoteProblemKind } from "../../lib/note-api";

/**
 * 做题页「笔记」Tab：列出当前题目绑定的笔记，并支持为本题新建笔记。
 * 与讨论模块同源（同一 note-api），题目引用用 problemKind + problemRef 定位（多对一）。
 */
export function ProblemNotesPanel({ problemKind, problemRef, problemCode, loggedIn }: {
  problemKind: NoteProblemKind;
  problemRef: string;
  problemCode: string;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState<NoteListEntry[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!loggedIn) return;
    let active = true;
    NoteApi.list({ problemRef, problemKind, limit: 50 })
      .then((result) => { if (active) { setNotes(result.items); setState("ready"); } })
      .catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [loggedIn, problemRef, problemKind]);

  const startNew = () => router.push(`/notes/new?problemRef=${encodeURIComponent(problemRef)}&problemKind=${problemKind}&problemCode=${encodeURIComponent(problemCode)}`);

  return (
    <div className="problem-content">
      <div className="tests-heading">
        <div><h2>本题笔记</h2><p>把这道题的解题思路、坑点与题解记录成 Markdown 笔记。</p></div>
        <div className="test-actions"><button onClick={startNew}>＋ 为本题写笔记</button></div>
      </div>
      {!loggedIn ? (
        <div className="note-empty"><b>登录后可写笔记</b><span>笔记会与这道题绑定，跨设备同步。</span></div>
      ) : state === "loading" ? (
        <div className="note-empty"><span>加载中…</span></div>
      ) : notes.length === 0 ? (
        <div className="note-empty"><b>还没有本题笔记</b><span>点击右上角「＋ 为本题写笔记」开始。</span></div>
      ) : (
        <div className="note-grid">
          {notes.map((note) => (
            <button key={note.id} className="note-card" onClick={() => router.push(`/notes/${encodeURIComponent(note.id)}`)}>
              <div className="note-card-badges">
                <span className={`note-badge ${note.visibility}`}>{note.visibility === "private" ? "私有" : "公开"}</span>
              </div>
              <h3>{note.title || "未命名笔记"}</h3>
              <p>{note.summary || "（暂无摘要）"}</p>
              <div className="note-stats"><span>♡ {note.likeCount}</span><span>💬 {note.commentCount}</span><span>{new Date(note.updatedAt).toLocaleDateString("zh-CN")}</span></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
