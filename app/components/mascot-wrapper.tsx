"use client";

import { useState, useEffect } from "react";
import { useThemeStore } from "../stores/theme-store";
import { DesktopMascot } from "./mascot";

export function MascotWrapper() {
  const theme = useThemeStore();
  const [visible, setVisible] = useState(true);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem("codenow-mascot-visible")
      || localStorage.getItem("codeforge-mascot-visible");
    if (saved === "false") setVisible(false);
  }, []);

  useEffect(() => {
    localStorage.setItem("codenow-mascot-visible", String(visible));
  }, [visible]);

  if (theme.themeMode !== "girl") return null;

  return (
    <DesktopMascot
      visible={visible}
      messageIndex={messageIndex}
      onCycle={() => setMessageIndex((v) => (v + 1) % 13)}
      onSetVisible={setVisible}
      onSetMessageIndex={setMessageIndex}
    />
  );
}
