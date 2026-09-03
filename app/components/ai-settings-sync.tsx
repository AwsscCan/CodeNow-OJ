"use client";

import { useEffect } from "react";
import { authClient } from "../lib/auth-client";
import { useAiStore, type PublicAiSettings } from "../stores/ai-store";

export function AiSettingsSync() {
  const session = authClient.useSession();
  const userId = session.data?.user.id ?? null;

  useEffect(() => {
    const controller = new AbortController();
    if (!userId) {
      useAiStore.getState().clearSettings();
      return () => controller.abort();
    }
    fetch("/api/ai-settings", { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => response.ok ? response.json() as Promise<PublicAiSettings> : null)
      .then((settings) => { if (settings && !controller.signal.aborted) useAiStore.getState().hydrateSettings(settings); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [userId]);

  return null;
}
