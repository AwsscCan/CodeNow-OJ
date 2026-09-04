"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "girl";
export type EditorTheme = "light" | "dark" | "girl";
export type CppFormatMode = "preserve" | "full";

type ThemeStore = {
  themeMode: ThemeMode;
  editorTheme: EditorTheme;
  formatMode: CppFormatMode;
  setThemeMode: (mode: ThemeMode) => void;
  setEditorTheme: (theme: EditorTheme) => void;
  setFormatMode: (mode: CppFormatMode) => void;
};

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      themeMode: "light",
      editorTheme: "dark",
      formatMode: "preserve",
      setThemeMode: (themeMode) => set({ themeMode }),
      setEditorTheme: (editorTheme) => set({ editorTheme }),
      setFormatMode: (formatMode) => set({ formatMode }),
    }),
    {
      name: "codenow-theme",
      skipHydration: true,
      partialize: (state) => ({ themeMode: state.themeMode, editorTheme: state.editorTheme, formatMode: state.formatMode }),
    },
  ),
);
