"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { renderMarkdownToSafeHtml } from "../../lib/notes/markdown";

const emptySubscribe = () => () => {};

/**
 * 笔记富文本的唯一安全渲染出口：Markdown 原文经白名单消毒后渲染。
 * 服务端渲染纯文本占位（无 DOM 无法消毒），客户端水合后替换为消毒 HTML，避免水合不一致。
 * 含 $ 定界符时按需懒加载 KaTeX 渲染 LaTeX 公式（消毒后 DOM 上操作，代码块内不处理）。
 */
export function SafeMarkdown({ value, className }: { value: string; className?: string }) {
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const html = useMemo(() => (isClient ? renderMarkdownToSafeHtml(value) : ""), [isClient, value]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isClient || !value.includes("$")) return;
    let cancelled = false;
    void import("katex/contrib/auto-render").then(({ default: renderMathInElement }) => {
      if (cancelled || !containerRef.current) return;
      renderMathInElement(containerRef.current, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
        ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "a"],
      });
    }).catch(() => { /* KaTeX 加载失败时静默降级为原文 */ });
    return () => { cancelled = true; };
  }, [isClient, html, value]);

  if (!isClient) {
    return (
      <div className={className}>
        <pre className="note-markdown-fallback">{value}</pre>
      </div>
    );
  }
  return <div ref={containerRef} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
