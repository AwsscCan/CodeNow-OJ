"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Toast } from "../components/toast";
import { Topbar } from "../components/topbar";
import { useToast } from "../hooks/use-toast";
import { authClient } from "../lib/auth-client";
import { NoteApi } from "../lib/note-api";
import { useNoteStore } from "../stores/note-store";
import { useThemeStore } from "../stores/theme-store";

export default function NotesPage() {
  const router = useRouter();
  const theme = useThemeStore();
  const { notice, toast } = useToast();
  const session = authClient.useSession();
  const store = useNoteStore();
  const userId = session.data?.user?.id ?? null;
  const [search, setSearch] = useState("");

  useEffect(() => {
    store.switchNoteAccount(userId);
    if (!userId) return;
    const controller = new AbortController();
    NoteApi.list({ limit: 50 })
      .then((result) => store.hydrateNotes(userId, result.items))
      .catch(() => { /* 离线时保留本地视图 */ });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const cards = useMemo(() => {
    if (userId) return store.cloudNotes.map((note) => ({ id: note.id, title: note.title, summary: note.summary, visibility: note.visibility, source: note.source, likeCount: note.likeCount, commentCount: note.commentCount, updatedAt: note.updatedAt, local: false }));
    return store.localDrafts.map((draft) => ({ id: draft.id, title: draft.title, summary: draft.summary, visibility: draft.visibility, source: draft.source, likeCount: 0, commentCount: 0, updatedAt: draft.updatedAt, local: true }));
  }, [userId, store.cloudNotes, store.localDrafts]);

  const filtered = cards.filter((card) => !search || card.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <main className={`app-shell theme-${theme.themeMode}`}>
      <Topbar onToast={toast} onSignedOut={() => store.switchNoteAccount(null)} />
      <div className="library-page">
        <div className="library-hero">
          <div>
            <span>CODENOW 讨论</span>
            <h1>我的笔记</h1>
            <p>{userId ? "用 Markdown 记录题解与思路，可关联题库、发布分享。" : "游客笔记仅保存在本机，登录后可迁移上云。"}</p>
          </div>
          <button onClick={() => router.push("/notes/new")}>＋ 写笔记</button>
        </div>

        <div className="note-view-switch">
          <button className="active">我的笔记</button>
          <button onClick={() => toast("公开广场将在后续版本开放")}>公开广场</button>
        </div>

        <div className="note-toolbar">
          <label>
            <span aria-hidden="true">🔍</span>
            <input placeholder="搜索标题" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
        </div>

        {filtered.length === 0 ? (
          <div className="note-empty">
            <b>还没有笔记</b>
            <span>点击右上角「＋ 写笔记」写下第一篇吧</span>
          </div>
        ) : (
          <div className="note-grid">
            {filtered.map((card) => (
              <button
                key={card.id}
                className="note-card"
                onClick={() => router.push(card.local ? `/notes/new?draft=${encodeURIComponent(card.id)}` : `/notes/${encodeURIComponent(card.id)}`)}
              >
                <div className="note-card-badges">
                  <span className={`note-badge ${card.visibility}`}>{card.visibility === "private" ? "私有" : "公开"}</span>
                  {card.source === "problem" ? <span className="note-badge problem">题目笔记</span> : null}
                  {card.local ? <span className="note-badge">仅本地</span> : null}
                </div>
                <h3>{card.title || "未命名笔记"}</h3>
                <p>{card.summary || "（暂无摘要）"}</p>
                <div className="note-stats">
                  <span>♡ {card.likeCount}</span>
                  <span>💬 {card.commentCount}</span>
                  <span>{new Date(card.updatedAt).toLocaleDateString("zh-CN")}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <Toast message={notice} />
    </main>
  );
}
