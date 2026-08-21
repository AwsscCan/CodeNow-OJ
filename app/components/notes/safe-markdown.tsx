"use client";

import { useMemo, useSyncExternalStore } from "react";
import { renderMarkdownToSafeHtml } from "../../lib/notes/markdown";

const emptySubscribe = () => () => {};

/**
 * 笔记富文本的唯一安全渲染出口：Markdown 原文经白名单消毒后渲染。
 * 服务端渲染纯文本占位（无 DOM 无法消毒），客户端水合后替换为消毒 HTML，避免水合不一致。
 * 含 $ 定界符时在同一安全渲染周期同步生成 KaTeX DOM（代码块内不处理）。
 */
export function SafeMarkdown({ value, className }: { value: string; className?: string }) {
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const html = useMemo(() => (isClient ? renderMarkdownToSafeHtml(value) : ""), [isClient, value]);

  if (!isClient) {
    return (
      <div className={className}>
        <pre className="note-markdown-fallback">{value}</pre>
      </div>
    );
  }
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
