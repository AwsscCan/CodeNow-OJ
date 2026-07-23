"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "girl";
export type EditorTheme = "light" | "dark" | "girl";

function readMigrated(currentKey: string, legacyKey: string): string | null {
  if (typeof localStorage === "undefined") return null;
  const current = localStorage.getItem(currentKey);
  if (current !== null) return current;
  const legacy = localStorage.getItem(legacyKey);
  if (legacy !== null) localStorage.setItem(currentKey, legacy);
  return legacy;
}

function getInitialTheme(): ThemeMode {
  const saved = readMigrated("codenow-theme", "codeforge-theme");
  if (saved === "light" || saved === "dark" || saved === "girl") return saved;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

function getInitialEditorTheme(): EditorTheme {
  const saved = readMigrated("codenow-editor-theme", "codeforge-editor-theme");
  if (saved === "light" || saved === "dark" || saved === "girl") return saved;
  return "dark";
}

type ThemeStore = {
  themeMode: ThemeMode;
  editorTheme: EditorTheme;
  setThemeMode: (mode: ThemeMode) => void;
  setEditorTheme: (theme: EditorTheme) => void;
};

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      themeMode: getInitialTheme(),
      editorTheme: getInitialEditorTheme(),
      setThemeMode: (themeMode) => set({ themeMode }),
      setEditorTheme: (editorTheme) => set({ editorTheme }),
    }),
    {
      name: "codenow-theme",
      partialize: (state) => ({ themeMode: state.themeMode, editorTheme: state.editorTheme }),
    },
  ),
);
