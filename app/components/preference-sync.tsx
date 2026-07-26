"use client";

import { useEffect, useRef } from "react";
import { authClient } from "../lib/auth-client";
import { useThemeStore, type EditorTheme, type ThemeMode } from "../stores/theme-store";

type PreferenceResponse = {
  preferences: { themeMode: ThemeMode; editorTheme: EditorTheme };
  version: number;
  updatedAt: string | null;
};

function preferenceKey(preferences: PreferenceResponse["preferences"]) {
  return `${preferences.themeMode}:${preferences.editorTheme}`;
}
export function PreferenceSync({ delay = 600 }: { delay?: number }) {
  const session = authClient.useSession();
  const userId = session.data?.user.id ?? null;
  const themeMode = useThemeStore((state) => state.themeMode);
  const editorTheme = useThemeStore((state) => state.editorTheme);
  const version = useRef(0);
  const hydratedUser = useRef<string | null>(null);
  const lastSynced = useRef("");
  const generation = useRef(0);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    if (session.isPending || !userId) {
      hydratedUser.current = null;
      return;
    }
    void (async () => {
      try {
        const response = await fetch("/api/preferences", { headers: { Accept: "application/json" } });
        if (!response.ok) return;
        const body = await response.json() as PreferenceResponse;
        if (generation.current !== currentGeneration) return;
        version.current = body.version;
        hydratedUser.current = userId;
        lastSynced.current = preferenceKey(body.preferences);
        useThemeStore.setState(body.preferences);
      } catch {
        // Local persistence remains authoritative while the cloud is unavailable.
      }
    })();
  }, [session.isPending, userId]);

  useEffect(() => {
    if (!userId || hydratedUser.current !== userId) return;
    const preferences = { themeMode, editorTheme };
    const key = preferenceKey(preferences);
    if (key === lastSynced.current) return;
    const currentGeneration = generation.current;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: version.current, patch: preferences }),
        });
        if (generation.current !== currentGeneration) return;
        if (response.status === 409) {
          const latest = await fetch("/api/preferences", { headers: { Accept: "application/json" } });
          if (!latest.ok || generation.current !== currentGeneration) return;
          const body = await latest.json() as PreferenceResponse;
          version.current = body.version;
          lastSynced.current = preferenceKey(body.preferences);
          useThemeStore.setState(body.preferences);
          return;
        }
        if (!response.ok) return;
        const body = await response.json() as PreferenceResponse;
        version.current = body.version;
        lastSynced.current = preferenceKey(body.preferences);
      } catch {
        // A later local change or login will retry without losing the persisted theme.
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, editorTheme, themeMode, userId]);

  return null;
}
