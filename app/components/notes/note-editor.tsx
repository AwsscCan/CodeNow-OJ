"use client";

import { useState } from "react";
import type { SyncStatus } from "../../hooks/use-cloud-save";
import type { NoteProblemKind, NoteVisibility } from "../../lib/note-api";
import { ProblemRefPicker, type PickedProblem } from "./problem-ref-picker";
import { SafeMarkdown } from "./safe-markdown";

export type NoteEditorRef = { problemKind: NoteProblemKind; problemRef: string };
export type NoteEditorValue = {
  title: string;
  content: string;
  summary: string;
  tags: string[];
  visibility: NoteVisibility;
  problemRefs: NoteEditorRef[];
};

const SYNC_LABEL: Record<SyncStatus, string> = {
  "local-only": "仅本地", saving: "正在保存…", synced: "已同步", failed: "保存失败", conflicted: "版本冲突",
};

/**
 * 笔记编辑器：标题 + 标签 + 可见性开关 + 题库选题 + Markdown 编辑与安全预览分栏。
 * 由新建页与详情编辑态共用，正文预览走唯一安全出口 SafeMarkdown。
 */
export function NoteEditor({ value, onChange, onSubmit, submitLabel, status, onDelete, busy }: {
  value: NoteEditorValue;
  onChange: (next: NoteEditorValue) => void;
  onSubmit: () => void;
  submitLabel: string;
  status?: SyncStatus;
  onDelete?: () => void;
  busy?: boolean;
}) {
  const [tagDraft, setTagDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const addTag = () => {
    const tag = tagDraft.trim();
    if (tag && value.tags.length < 10 && !value.tags.includes(tag)) onChange({ ...value, tags: [...value.tags, tag] });
    setTagDraft("");
  };

  const insertProblem = (picked: PickedProblem) => {
    const link = `\n[📎 ${picked.problemCode} ${picked.title}](/problem/${encodeURIComponent(picked.problemCode)})\n`;
    const ref: NoteEditorRef = { problemKind: picked.problemKind, problemRef: picked.problemRef };
    const exists = value.problemRefs.some((item) => item.problemRef === ref.problemRef && item.problemKind === ref.problemKind);
    onChange({ ...value, content: value.content + link, problemRefs: exists ? value.problemRefs : [...value.problemRefs, ref] });
  };

  return (
    <div className="note-editor-shell">
      <div className="note-editor-head">
        <input
          className="note-title-input"
          placeholder="笔记标题"
          value={value.title}
          maxLength={200}
          onChange={(event) => onChange({ ...value, title: event.target.value })}
        />
        <button
          type="button"
          className="note-visibility-toggle"
          onClick={() => {
            if (value.visibility === "private" && !window.confirm("公开后所有登录用户都能浏览、评论、点赞这篇笔记，确定公开？")) return;
            onChange({ ...value, visibility: value.visibility === "private" ? "public" : "private" });
          }}
        >
          可见性 <b>{value.visibility === "private" ? "🔒 私有" : "🌐 公开"}</b>
        </button>
        <button type="button" className="note-visibility-toggle" onClick={() => setPickerOpen(true)}>
          📎 插入题目{value.problemRefs.length ? ` (${value.problemRefs.length})` : ""}
        </button>
        {status ? <span className={`note-sync ${status}`}>{SYNC_LABEL[status]}</span> : null}
      </div>

      <div className="note-tag-input">
        {value.tags.map((tag) => (
          <span key={tag} className="note-tag-chip">
            #{tag}
            <button type="button" aria-label={`移除标签 ${tag}`} onClick={() => onChange({ ...value, tags: value.tags.filter((item) => item !== tag) })}>×</button>
          </span>
        ))}
        <input
          placeholder="添加标签，回车确认"
          value={tagDraft}
          onChange={(event) => setTagDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTag(); } }}
        />
      </div>

      <div className="note-editor-split">
        <textarea
          placeholder="用 Markdown 记录你的解题思路…"
          value={value.content}
          onChange={(event) => onChange({ ...value, content: event.target.value })}
        />
        <div className="note-preview">
          <SafeMarkdown className="note-md" value={value.content || "_预览区_"} />
        </div>
      </div>

      <div className="note-actions">
        <button type="button" className="primary" onClick={onSubmit} disabled={busy || !value.title.trim()}>{submitLabel}</button>
        {onDelete ? <button type="button" className="danger" onClick={onDelete}>删除</button> : null}
      </div>

      <ProblemRefPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={insertProblem} />
    </div>
  );
}
