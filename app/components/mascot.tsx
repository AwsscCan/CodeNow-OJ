/* CodeNow OJ · 桌宠(高木同学)交互组件 · Bamzc */

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { MascotMood } from "../stores/mascot-lines";

type MascotPosition = { x: number; y: number };

/** 点 (x, y) 是否落在矩形内 */
export function isInsideDropZone(x: number, y: number, zone: DOMRect | null): boolean {
  if (!zone) return false;
  return x >= zone.left && x <= zone.right && y >= zone.top && y <= zone.bottom;
}

/** 桌宠松手时，其中心是否落在编辑区投放区([data-mascot-drop-zone])内 */
export function droppedInsideEditor(node: HTMLElement | null): boolean {
  if (!node) return false;
  const rect = node.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const zone = document.querySelector("[data-mascot-drop-zone]")?.getBoundingClientRect() ?? null;
  return isInsideDropZone(centerX, centerY, zone);
}

export function DesktopMascot({
  visible,
  message,
  mood,
  sprite,
  onCycle,
  onDragDrop,
  onSetVisible,
}: {
  visible: boolean;
  message: string;
  mood: MascotMood;
  sprite: number;
  onCycle: () => void;
  onDragDrop?: (dragged: boolean, insideEditor: boolean) => void;
  onSetVisible: (v: boolean) => void;
}) {
  const mascotRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<MascotPosition | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = localStorage.getItem("codenow-mascot-position");
    if (!saved) return null;
    try {
      const parsed: unknown = JSON.parse(saved);
      if (parsed && typeof parsed === "object") {
        const candidate = parsed as Partial<MascotPosition>;
        if (typeof candidate.x === "number" && typeof candidate.y === "number") {
          return { x: candidate.x, y: candidate.y };
        }
      }
    } catch { /* ignore invalid saved positions */ }
    return null;
  });
  const [dragging, setDragging] = useState(false);
  const dragged = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragStart = useRef({ x: 0, y: 0 });
  const nextPosition = useRef<MascotPosition | null>(null);
  const dragFrame = useRef<number | null>(null);
  const dragSize = useRef({ width: 205, height: 255 });

  useEffect(() => {
    if (position) localStorage.setItem("codenow-mascot-position", JSON.stringify(position));
  }, [position]);

  // 拖拽期间的 window 监听清理句柄；卸载时兜底移除，防止监听泄漏
  const dragCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => { dragCleanup.current?.(); dragCleanup.current = null; }, []);

  // window 监听在 pointerdown 时同步挂载(而非 effect 提交后)，
  // 消灭"快速按下抬起时 pointerup 落在渲染间隙被丢弃、dragging 卡死"的竞态
  const startDrag = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0 || dragCleanup.current) return;
    const rect = mascotRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    dragSize.current = { width: rect.width, height: rect.height };
    dragOffset.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    dragStart.current = { x: event.clientX, y: event.clientY };
    dragged.current = false;
    nextPosition.current = { x: rect.left, y: rect.top };
    setPosition({ x: rect.left, y: rect.top });
    setDragging(true);

    const apply = () => {
      dragFrame.current = null;
      const next = nextPosition.current;
      const node = mascotRef.current;
      if (!next || !node) return;
      node.style.left = `${next.x}px`;
      node.style.top = `${next.y}px`;
      node.style.right = "auto";
      node.style.bottom = "auto";
    };
    const move = (e: PointerEvent) => {
      const { width, height } = dragSize.current;
      const x = Math.min(window.innerWidth - 16 - width, Math.max(16, e.clientX - dragOffset.current.x));
      const y = Math.min(window.innerHeight - 16 - height, Math.max(16, e.clientY - dragOffset.current.y));
      nextPosition.current = { x, y };
      if (Math.abs(e.clientX - dragStart.current.x) > 3 || Math.abs(e.clientY - dragStart.current.y) > 3) {
        dragged.current = true;
      }
      if (dragFrame.current === null) dragFrame.current = requestAnimationFrame(apply);
    };
    const stop = () => {
      dragCleanup.current?.();
      dragCleanup.current = null;
      apply();
      setDragging(false);
      if (nextPosition.current) setPosition(nextPosition.current);
      // 落点碰撞检测：拖动过且落在编辑区投放区内，才视为"投喂"编辑器
      const insideEditor = dragged.current && droppedInsideEditor(mascotRef.current);
      if (onDragDrop) onDragDrop(dragged.current, insideEditor);
    };
    dragCleanup.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      if (dragFrame.current !== null) { cancelAnimationFrame(dragFrame.current); dragFrame.current = null; }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }, [onDragDrop]);

  const clickCharacter = useCallback(() => {
    if (dragged.current) { dragged.current = false; return; }
    onCycle();
  }, [onCycle]);

  if (!visible) {
    return (
      <button className="mascot-reopen" onClick={() => onSetVisible(true)} title="召回 CodeNow 编程伙伴">
        <img src="/codenow/icon.jpg" alt="" loading="lazy" decoding="async" />
        召回伙伴
      </button>
    );
  }

  return (
    <aside
      ref={mascotRef}
      className={`desktop-mascot mood-${mood} ${dragging ? "dragging" : ""}`}
      aria-label="CodeNow 编程伙伴"
      style={position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : undefined}
    >
      <button className="mascot-close" aria-label="暂时隐藏桌宠" onClick={() => onSetVisible(false)}>×</button>
      <button className="mascot-bubble" onClick={onCycle} aria-live="polite" aria-atomic={true}>
        {message}<small>点击换台词，按住人物可拖动到编辑器</small>
      </button>
      {/* key 按台词重建节点，保证同 mood 连续两句也会重放 one-shot 动作动画 */}
      <button key={message} className={`mascot-character ${sprite === 6 ? "original-state" : ""}`} aria-label="和 CodeNow 编程伙伴互动" onPointerDown={startDrag} onClick={clickCharacter}>
        {sprite === 6 ? (
          <img className="mascot-original" src="/codenow/mascot.png" alt="" aria-hidden="true" loading="lazy" decoding="async" />
        ) : (
          <span className={`mascot-sprite-frame sprite-${sprite}`} aria-hidden="true">
            <img src="/codenow/mascot-sprites.png" alt="" loading="lazy" decoding="async" />
          </span>
        )}
        <span className="sr-only">切换 CodeNow 编程伙伴台词。当前：{message}</span>
      </button>
    </aside>
  );
}
