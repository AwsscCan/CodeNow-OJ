/* CodeNow OJ · 桌宠挂载与状态接线 · Bamzc */

"use client";

import { useState, useEffect } from "react";
import { useMascotLine } from "../hooks/use-mascot-line";
import { buildMascotLearningFeedback, useMascotStore } from "../stores/mascot-store";
import { useMemoryStore } from "../stores/memory-store";
import { useThemeStore } from "../stores/theme-store";
import { DesktopMascot } from "./mascot";

export function MascotWrapper() {
  const theme = useThemeStore();
  // 桌宠仅在少女主题出现，其它主题下不挂载、不请求台词
  if (theme.themeMode !== "girl") return null;
  return <MascotActive />;
}

function MascotActive() {
  const line = useMascotStore((s) => s.line);
  const phase = useMascotStore((s) => s.phase);
  const context = useMascotStore((s) => s.context);
  const requestAiSolve = useMascotStore((s) => s.requestAiSolve);
  const learningFeedbackRequestId = useMascotStore((s) => s.learningFeedbackRequestId);
  const dismissedLearningFeedbackRequestId = useMascotStore((s) => s.dismissedLearningFeedbackRequestId);
  const dismissLearningFeedback = useMascotStore((s) => s.dismissLearningFeedback);
  const memories = useMemoryStore((s) => s.memories);
  const { refresh } = useMascotLine();
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("codenow-mascot-visible")
      || localStorage.getItem("codeforge-mascot-visible");
    return saved !== "false";
  });

  useEffect(() => {
    localStorage.setItem("codenow-mascot-visible", String(visible));
  }, [visible]);

  const learningFeedback = learningFeedbackRequestId !== dismissedLearningFeedbackRequestId
    ? buildMascotLearningFeedback(phase, context, memories)
    : null;

  return (
    <DesktopMascot
      visible={visible}
      message={line.text}
      mood={line.mood}
      sprite={line.sprite}
      onCycle={() => { void refresh(); }}
      onDragDrop={(_dragged, insideEditor) => { if (insideEditor) requestAiSolve(); }}
      onSetVisible={setVisible}
      learningFeedback={learningFeedback}
      onDismissLearningFeedback={dismissLearningFeedback}
    />
  );
}
