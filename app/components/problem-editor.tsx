/* CodeNow OJ · 题面手动编辑器(修正 AI 识别错误) · Bamzc */

"use client";

import { useState } from "react";
import { pasteImageIntoMarkdown } from "../lib/paste-image";
import type { Problem } from "../stores/problem-store";

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
    pasteImageIntoMarkdown(event, draft[field], (next) => {
      setError("");
      setDraft((d) => ({ ...d, [field]: next }));
    }, setError, "题图");
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
