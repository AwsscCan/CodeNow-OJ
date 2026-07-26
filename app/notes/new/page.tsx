"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { NoteEditor, type NoteEditorValue } from "../../components/notes/note-editor";
import { Toast } from "../../components/toast";
import { Topbar } from "../../components/topbar";
import { useToast } from "../../hooks/use-toast";
import { authClient } from "../../lib/auth-client";
import { NoteApi, NoteApiError, type NoteProblemKind } from "../../lib/note-api";
import { useNoteStore } from "../../stores/note-store";
import { useThemeStore } from "../../stores/theme-store";

function deriveSummary(content: string) {
  const text = content.replace(/[#*`>\-\n]+/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, 120) || null;
}

function NewNoteInner() {
  const router = useRouter();
  const theme = useThemeStore();
  const { notice, toast } = useToast();
  const session = authClient.useSession();
  const store = useNoteStore();
  const params = useSearchParams();
  const userId = session.data?.user?.id ?? null;

  const draftId = params.get("draft");
  const problemRef = params.get("problemRef");
  const problemKind = (params.get("problemKind") as NoteProblemKind | null) ?? null;
  const existingDraft = draftId ? store.localDrafts.find((item) => item.id === draftId) : undefined;

  const [value, setValue] = useState<NoteEditorValue>(() => existingDraft
    ? { title: existingDraft.title, content: existingDraft.content, summary: existingDraft.summary ?? "", tags: existingDraft.tags, visibility: existingDraft.visibility, problemRefs: [] }
    : { title: "", content: "", summary: "", tags: [], visibility: "private", problemRefs: [] });
  const [busy, setBusy] = useState(false);

  const source = problemRef ? "problem" as const : (existingDraft?.source ?? "standalone" as const);

  async function submit() {
    setBusy(true);
    try {
      if (userId) {
        const result = await NoteApi.create({
          title: value.title.trim(),
          content: value.content,
          summary: deriveSummary(value.content),
          visibility: value.visibility,
          source,
          ...(value.problemRefs.length ? { problemRefs: value.problemRefs } : {}),
          ...(source === "problem" ? { problemKind: problemKind ?? existingDraft?.problemKind ?? "public", problemRef: problemRef ?? existingDraft?.problemRef ?? undefined } : {}),
        });
        if (draftId) store.removeLocalDraft(draftId);
        router.push(`/notes/${encodeURIComponent(result.note.id)}`);
      } else {
        const id = draftId ?? crypto.randomUUID();
        store.upsertLocalDraft({
          id, title: value.title.trim(), content: value.content, summary: deriveSummary(value.content),
          tags: value.tags, visibility: value.visibility, source,
          problemKind: source === "problem" ? (problemKind ?? "public") : null,
          problemRef: source === "problem" ? problemRef : null,
          updatedAt: new Date().toISOString(),
        });
        toast("已保存到本机，登录后可迁移上云");
        router.push("/notes");
      }
    } catch (error) {
      toast(error instanceof NoteApiError ? error.message : "保存失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={`app-shell theme-${theme.themeMode}`}>
      <Topbar onToast={toast} onSignedOut={() => store.switchNoteAccount(null)} />
      <div className="library-page note-page-body">
        <div className="library-hero">
          <div>
            <span>CODENOW 讨论</span>
            <h1>{draftId ? "编辑草稿" : "写笔记"}</h1>
            <p>{userId ? "支持 Markdown，可选择私有或公开。" : "游客笔记仅保存在本机。"}</p>
          </div>
          <button onClick={() => router.push("/notes")}>← 返回</button>
        </div>
        <NoteEditor value={value} onChange={setValue} onSubmit={submit} submitLabel={userId ? "保存并发布" : "保存到本机"} busy={busy} />
      </div>
      <Toast message={notice} />
    </main>
  );
}

export default function NewNotePage() {
  return <Suspense fallback={null}><NewNoteInner /></Suspense>;
}
