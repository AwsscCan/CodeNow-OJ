"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Toast } from "../components/toast";
import { Topbar } from "../components/topbar";
import { useToast } from "../hooks/use-toast";
import { authClient } from "../lib/auth-client";
import { NoteApi, type NotePublicEntry } from "../lib/note-api";
import { useNoteStore } from "../stores/note-store";
import { useThemeStore } from "../stores/theme-store";

type Card = { id: string; title: string; summary: string | null; visibility: string; source: string; likeCount: number; commentCount: number; updatedAt: string; author?: string; local?: boolean; tags?: string[] };

export default function NotesPage() {
  const router = useRouter();
  const theme = useThemeStore();
  const { notice, toast } = useToast();
  const session = authClient.useSession();
  const store = useNoteStore();
  const userId = session.data?.user?.id ?? null;
  const view = store.listView;
  const [search, setSearch] = useState("");
  const [publicNotes, setPublicNotes] = useState<NotePublicEntry[]>([]);

  useEffect(() => {
    store.switchNoteAccount(userId);
    if (!userId) return;
    NoteApi.list({ limit: 50 }).then((result) => store.hydrateNotes(userId, result.items)).catch(() => { /* 离线保留本地视图 */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (view !== "public") return;
    let active = true;
    NoteApi.listPublic({ limit: 50 }).then((result) => { if (active) setPublicNotes(result.items); }).catch(() => { if (active) setPublicNotes([]); });
    return () => { active = false; };
  }, [view]);

  const cards: Card[] = useMemo(() => {
    if (view === "public") return publicNotes.map((note) => ({ id: note.id, title: note.title, summary: note.summary, visibility: note.visibility, source: note.source, likeCount: note.likeCount, commentCount: note.commentCount, updatedAt: note.publishedAt ?? note.updatedAt, author: note.author.name }));
    if (userId) return store.cloudNotes.map((note) => ({ id: note.id, title: note.title, summary: note.summary, visibility: note.visibility, source: note.source, likeCount: note.likeCount, commentCount: note.commentCount, updatedAt: note.updatedAt, tags: note.tags }));
    return store.localDrafts.map((draft) => ({ id: draft.id, title: draft.title, summary: draft.summary, visibility: draft.visibility, source: draft.source, likeCount: 0, commentCount: 0, updatedAt: draft.updatedAt, local: true, tags: draft.tags }));
  }, [view, publicNotes, userId, store.cloudNotes, store.localDrafts]);

  const filtered = cards.filter((card) => !search || card.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <main className={`app-shell theme-${theme.themeMode}`}>
      <Topbar onToast={toast} onSignedOut={() => store.switchNoteAccount(null)} />
      <div className="library-page">
        <div className="library-hero">
          <div>
            <span>CODENOW 讨论</span>
            <h1>{view === "public" ? "公开广场" : "我的笔记"}</h1>
            <p>{view === "public" ? "浏览大家公开分享的题解与笔记。" : userId ? "用 Markdown 记录题解与思路，可关联题库、发布分享。" : "游客笔记仅保存在本机，登录后可迁移上云。"}</p>
          </div>
          <button onClick={() => router.push("/notes/new")}>＋ 写笔记</button>
        </div>

        <div className="note-view-switch">
          <button className={view === "mine" ? "active" : ""} onClick={() => store.setListView("mine")}>我的笔记</button>
          <button className={view === "public" ? "active" : ""} onClick={() => store.setListView("public")}>公开广场</button>
        </div>

        <div className="note-toolbar">
          <label>
            <span aria-hidden="true">🔍</span>
            <input placeholder="搜索标题" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
        </div>

        {filtered.length === 0 ? (
          <div className="note-empty">
            <b>{view === "public" ? "还没有公开笔记" : "还没有笔记"}</b>
            <span>{view === "public" ? "成为第一个分享题解的人吧" : "点击右上角「＋ 写笔记」写下第一篇吧"}</span>
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
                  {(card.tags ?? []).slice(0, 3).map((tag) => <span key={tag} className="note-badge tag">#{tag}</span>)}
                </div>
                <h3>{card.title || "未命名笔记"}</h3>
                <p>{card.summary || "（暂无摘要）"}</p>
                <div className="note-stats">
                  {card.author ? <span>✍ {card.author}</span> : null}
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
