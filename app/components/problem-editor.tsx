/* CodeNow OJ · 题面手动编辑器(修正 AI 识别错误) · Bamzc */

"use client";

import { useState } from "react";
import type { Problem } from "../stores/problem-store";

/** 内嵌 base64 图片的大小上限：防止 localStorage 与云端行大小被大图撑爆 */
const IMAGE_SIZE_LIMIT = 300 * 1024;

type MarkdownField = "description" | "inputFormat" | "outputFormat";

/**
 * 题面编辑表单：编辑标题、难度、限制与题面文本，保存交由调用方写回 store。
 * 题面文本支持 Markdown，可直接粘贴小图(转 base64 内嵌)或书写外链图片语法。
 * 样例与测试点数据在"测试点"Tab 维护，此处不重复编辑。
 */
export function ProblemEditor({ problem, onSave, onCancel }: {
  problem: Problem;
  onSave: (next: Problem) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Problem>(problem);
  const [error, setError] = useState("");

  function update<K extends keyof Problem>(field: K, value: Problem[K]) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  function pasteImage(event: React.ClipboardEvent<HTMLTextAreaElement>, field: MarkdownField) {
    const item = Array.from(event.clipboardData?.items ?? []).find((entry) => entry.type.startsWith("image/"));
    if (!item) return;
    event.preventDefault();
    const file = item.getAsFile();
    if (!file) return;
    if (file.size > IMAGE_SIZE_LIMIT) {
      return setError("图片超过 300KB，请压缩后粘贴，或改用外链语法 ![说明](https://…)");
    }
    const start = event.currentTarget.selectionStart ?? draft[field].length;
    const end = event.currentTarget.selectionEnd ?? start;
    const reader = new FileReader();
    reader.onload = () => {
      const markdown = `![题图](${String(reader.result)})`;
      setError("");
      setDraft((d) => ({ ...d, [field]: `${d[field].slice(0, start)}${markdown}${d[field].slice(end)}` }));
    };
    reader.readAsDataURL(file);
  }

  function save() {
    if (!draft.title.trim()) return setError("题目标题不能为空");
    setError("");
    onSave({ ...draft, title: draft.title.trim() });
  }

  return (
    <div className="problem-editor">
      <label>题目标题<input value={draft.title} onChange={(e) => update("title", e.target.value)} /></label>
      <div className="problem-editor-row">
        <label>难度
          <select value={draft.difficulty} onChange={(e) => update("difficulty", e.target.value as Problem["difficulty"])}>
            <option value="入门">入门</option><option value="普及">普及</option><option value="提高">提高</option>
          </select>
        </label>
        <label>时间限制<input value={draft.time} onChange={(e) => update("time", e.target.value)} placeholder="1000 ms" /></label>
        <label>内存限制<input value={draft.memory} onChange={(e) => update("memory", e.target.value)} placeholder="128 MB" /></label>
      </div>
      <label>题目描述<textarea value={draft.description} onChange={(e) => update("description", e.target.value)} onPaste={(e) => pasteImage(e, "description")} /></label>
      <small className="paste-image-hint">支持 Markdown；可直接粘贴图片(≤300KB 自动内嵌)，大图请用外链 ![说明](https://…)</small>
      <label>输入格式<textarea value={draft.inputFormat} onChange={(e) => update("inputFormat", e.target.value)} onPaste={(e) => pasteImage(e, "inputFormat")} /></label>
      <label>输出格式<textarea value={draft.outputFormat} onChange={(e) => update("outputFormat", e.target.value)} onPaste={(e) => pasteImage(e, "outputFormat")} /></label>
      {error && <div className="field-error" role="alert">{error}</div>}
      <div className="problem-editor-actions">
        <small>样例与测试点请到「测试点」Tab 中修改，保存后自动同步。</small>
        <button type="button" onClick={onCancel}>取消</button>
        <button type="button" className="primary" onClick={save}>保存修改</button>
      </div>
    </div>
  );
}
