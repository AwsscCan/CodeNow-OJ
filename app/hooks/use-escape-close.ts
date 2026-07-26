/* CodeNow OJ · 弹窗/抽屉 Esc 关闭 · Bamzc */

"use client";

import { useEffect } from "react";

/**
 * 激活期间监听 Esc 关闭浮层；多个浮层同开时各自响应(一次 Esc 全部收起)。
 */
export function useEscapeClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, onClose]);
}
