"use client";

import { useState, useRef, useEffect, useCallback } from "react";

type MascotMood = "smile" | "laugh" | "smug" | "surprised" | "gentle" | "annoyed" | "angry";

const mascotStates: { mood: MascotMood; sprite: number; message: string }[] = [
  { mood: "smile", sprite: 6, message: "我就在这里看着你写哦。ふふ，偷懒的话我可是会发现的。" },
  { mood: "smile", sprite: 0, message: "今天也一起 AC 吧。ね，要不要来比一比谁先看穿题意？" },
  { mood: "laugh", sprite: 1, message: "勝負しよ？你先写，我来猜你会在哪个边界摔一跤。" },
  { mood: "smug", sprite: 2, message: "あれ？这个边界条件是不是被你悄悄略过去了？" },
  { mood: "surprised", sprite: 3, message: "诶，这个输出不太对吧。もう一回，认真看一遍？" },
  { mood: "gentle", sprite: 0, message: "大丈夫，慢慢来。先把思路理顺，代码自然就会听话。" },
  { mood: "annoyed", sprite: 4, message: "又 WA 了？もう，太天真啦。先看第一个没过的点。" },
  { mood: "angry", sprite: 5, message: "编译错误还提交？だめ。红线不消掉，我可不会放你过去。" },
  { mood: "smug", sprite: 2, message: "如果一发 AC，我就稍微夸你一下。ほんの少しだけ。" },
  { mood: "laugh", sprite: 1, message: "すごいじゃん！不过隐藏测试可没我这么温柔哦。" },
  { mood: "gentle", sprite: 0, message: "复杂度也要看，ね。只会暴力的话，可赢不了我。" },
  { mood: "surprised", sprite: 3, message: "おや？刚才这段实现有点聪明嘛，我差点就被你骗到了。" },
  { mood: "smile", sprite: 0, message: "那就约好了：你认真写，我认真看。ふふ，别输给我哦。" },
];

type MascotPosition = { x: number; y: number };

export function DesktopMascot({
  visible,
  messageIndex,
  onCycle,
  onDragDrop,
  onSetVisible,
}: {
  visible: boolean;
  messageIndex: number;
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

  useEffect(() => {
    if (!dragging) return;
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
    const move = (event: PointerEvent) => {
      const { width, height } = dragSize.current;
      const x = Math.min(window.innerWidth - 16 - width, Math.max(16, event.clientX - dragOffset.current.x));
      const y = Math.min(window.innerHeight - 16 - height, Math.max(16, event.clientY - dragOffset.current.y));
      nextPosition.current = { x, y };
      if (Math.abs(event.clientX - dragStart.current.x) > 3 || Math.abs(event.clientY - dragStart.current.y) > 3) {
        dragged.current = true;
      }
      if (dragFrame.current === null) dragFrame.current = requestAnimationFrame(apply);
    };
    const stop = () => {
      if (dragFrame.current !== null) { cancelAnimationFrame(dragFrame.current); dragFrame.current = null; }
      apply();
      setDragging(false);
      if (nextPosition.current) setPosition(nextPosition.current);
      if (onDragDrop) onDragDrop(dragged.current, false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    };
  }, [dragging, onDragDrop]);

  const startDrag = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return;
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
  }, []);

  const clickCharacter = useCallback(() => {
    if (dragged.current) { dragged.current = false; return; }
    onCycle();
  }, [onCycle]);

  const state = mascotStates[messageIndex % mascotStates.length];

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
      className={`desktop-mascot mood-${state.mood} ${dragging ? "dragging" : ""}`}
      aria-label="CodeNow 编程伙伴"
      style={position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : undefined}
    >
      <button className="mascot-close" aria-label="暂时隐藏桌宠" onClick={() => onSetVisible(false)}>×</button>
      <button className="mascot-bubble" onClick={onCycle}>
        {state.message}<small>点击换表情，按住人物可拖动</small>
      </button>
      <button className={`mascot-character ${state.sprite === 6 ? "original-state" : ""}`} aria-label="和 CodeNow 编程伙伴互动" onPointerDown={startDrag} onClick={clickCharacter}>
        {state.sprite === 6 ? (
          <img className="mascot-original" src="/codenow/mascot.png" alt="" aria-hidden="true" loading="lazy" decoding="async" />
        ) : (
          <span className={`mascot-sprite-frame sprite-${state.sprite}`} aria-hidden="true">
            <img src="/codenow/mascot-sprites.png" alt="" loading="lazy" decoding="async" />
          </span>
        )}
        <span className="sr-only">切换 CodeNow 编程伙伴表情</span>
      </button>
    </aside>
  );
}
