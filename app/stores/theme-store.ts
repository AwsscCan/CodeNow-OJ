"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "girl";
export type EditorTheme = "light" | "dark" | "girl";

type ThemeStore = {
  themeMode: ThemeMode;
  editorTheme: EditorTheme;
  setThemeMode: (mode: ThemeMode) => void;
  setEditorTheme: (theme: EditorTheme) => void;
};

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      themeMode: "light",
      editorTheme: "dark",
      setThemeMode: (themeMode) => set({ themeMode }),
      setEditorTheme: (editorTheme) => set({ editorTheme }),
    }),
    {
      name: "codenow-theme",
      skipHydration: true,
      partialize: (state) => ({ themeMode: state.themeMode, editorTheme: state.editorTheme }),
    },
  ),
);
