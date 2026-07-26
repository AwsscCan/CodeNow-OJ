"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NoteEditor, type NoteEditorValue } from "../../components/notes/note-editor";
import { SafeMarkdown } from "../../components/notes/safe-markdown";
import { Toast } from "../../components/toast";
import { Topbar } from "../../components/topbar";
import type { SyncStatus } from "../../hooks/use-cloud-save";
import { useToast } from "../../hooks/use-toast";
import { authClient } from "../../lib/auth-client";
import { NoteApi, NoteApiError, type CloudNote } from "../../lib/note-api";
import { useNoteStore } from "../../stores/note-store";
import { useThemeStore } from "../../stores/theme-store";

export default function NoteDetailPage() {
  const router = useRouter();
  const theme = useThemeStore();
  const { notice, toast } = useToast();
  const session = authClient.useSession();
  const store = useNoteStore();
  const { id } = useParams<{ id: string }>();
  const userId = session.data?.user?.id ?? null;

  const [note, setNote] = useState<CloudNote | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<NoteEditorValue>({ title: "", content: "", summary: "", tags: [], visibility: "private", problemRefs: [] });
  const [status, setStatus] = useState<SyncStatus>("synced");
  const loading = userId != null && note === undefined;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    NoteApi.get(id)
      .then((result) => {
        if (!active) return;
        setNote(result.note);
        setValue({
          title: result.note.title, content: result.note.content, summary: result.note.summary ?? "", tags: [], visibility: result.note.visibility,
          problemRefs: result.note.problemRefs.map((ref) => ({ problemKind: ref.problemKind, problemRef: ref.problemRef })),
        });
      })
      .catch(() => { if (active) setNote(null); });
    return () => { active = false; };
  }, [id, userId]);

  async function save() {
    if (!note) return;
    setStatus("saving");
    try {
      const result = await NoteApi.update(note.id, note.version, { title: value.title.trim(), content: value.content, summary: value.content ? value.content.slice(0, 120) : null, visibility: value.visibility, problemRefs: value.problemRefs });
      setNote(result.note);
      store.setNoteVersion(result.note.id, result.version);
      setStatus("synced");
      setEditing(false);
    } catch (error) {
      if (error instanceof NoteApiError && error.status === 409) { setStatus("conflicted"); toast("云端已被更新，请刷新后重试"); }
      else { setStatus("failed"); toast("保存失败，请稍后重试"); }
    }
  }

  async function remove() {
    if (!note || !window.confirm("确定删除这篇笔记？")) return;
    try {
      await NoteApi.remove(note.id, note.version);
      store.setCloudNotes(store.cloudNotes.filter((item) => item.id !== note.id));
      router.push("/notes");
    } catch {
      toast("删除失败，请稍后重试");
    }
  }

  return (
    <main className={`app-shell theme-${theme.themeMode}`}>
      <Topbar onToast={toast} onSignedOut={() => store.switchNoteAccount(null)} />
      <div className="library-page note-page-body">
        <div className="library-hero">
          <div>
            <span>CODENOW 讨论</span>
            <h1>{editing ? "编辑笔记" : (note?.title ?? "笔记")}</h1>
            <p>{note ? `更新于 ${new Date(note.updatedAt).toLocaleString("zh-CN")}` : ""}</p>
          </div>
          <button onClick={() => router.push("/notes")}>← 返回列表</button>
        </div>

        {!userId ? (
          <div className="note-empty"><b>请先登录</b><span>登录后即可查看你的笔记</span></div>
        ) : loading ? (
          <div className="note-empty"><span>加载中…</span></div>
        ) : !note ? (
          <div className="note-empty"><b>笔记不存在</b><span>它可能已被删除或不属于你</span></div>
        ) : editing ? (
          <NoteEditor value={value} onChange={setValue} onSubmit={save} submitLabel="保存修改" status={status} onDelete={remove} />
        ) : (
          <>
            <div className="note-card-badges" style={{ marginBottom: 14 }}>
              <span className={`note-badge ${note.visibility}`}>{note.visibility === "private" ? "私有" : "公开"}</span>
              {note.source === "problem" ? <span className="note-badge problem">题目笔记</span> : null}
            </div>
            <SafeMarkdown className="note-md note-preview" value={note.content} />
            <div className="note-actions">
              <button className="primary" onClick={() => setEditing(true)}>编辑</button>
              <button className="danger" onClick={remove}>删除</button>
            </div>
          </>
        )}
      </div>
      <Toast message={notice} />
    </main>
  );
}
