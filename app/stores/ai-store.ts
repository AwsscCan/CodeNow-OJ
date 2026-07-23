"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AiProvider = "deepseek" | "openai" | "custom";
export type ChatMessage = { role: "user" | "assistant"; content: string };

type AiStore = {
  apiKeys: Record<AiProvider, string>;
  provider: AiProvider;
  endpoint: string;
  model: string;
  chatMessages: ChatMessage[];
  setApiKey: (provider: AiProvider, value: string) => void;
  clearApiKey: (provider: AiProvider) => void;
  setProvider: (provider: AiProvider) => void;
  setEndpoint: (endpoint: string) => void;
  setModel: (model: string) => void;
  addChatMessage: (message: ChatMessage) => void;
  clearChat: () => void;
};

function loadKeys(): Record<AiProvider, string> {
  if (typeof localStorage === "undefined") return { deepseek: "", openai: "", custom: "" };
  try {
    const saved = localStorage.getItem("codenow-api-keys")
      || localStorage.getItem("codeforge-api-keys");
    if (saved) {
      const keys = JSON.parse(saved);
      return {
        deepseek: typeof keys.deepseek === "string" ? keys.deepseek : "",
        openai: typeof keys.openai === "string" ? keys.openai : "",
        custom: typeof keys.custom === "string" ? keys.custom : "",
      };
    }
  } catch { /* ignore */ }
  return { deepseek: "", openai: "", custom: "" };
}

function saveKeys(keys: Record<AiProvider, string>) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem("codenow-api-keys", JSON.stringify(keys));
}

export const useAiStore = create<AiStore>()(
  persist(
    (set, get) => ({
      apiKeys: loadKeys(),
      provider: "deepseek" as AiProvider,
      endpoint: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      chatMessages: [],

      setApiKey: (provider, value) => {
        const apiKeys = { ...get().apiKeys, [provider]: value };
        saveKeys(apiKeys);
        set({ apiKeys });
      },
      clearApiKey: (provider) => {
        const apiKeys = { ...get().apiKeys, [provider]: "" };
        saveKeys(apiKeys);
        set({ apiKeys });
      },
      setProvider: (provider) => {
        set({ provider });
        const defaults: Record<AiProvider, { endpoint: string; model: string }> = {
          deepseek: { endpoint: "https://api.deepseek.com", model: "deepseek-v4-flash" },
          openai: { endpoint: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
          custom: { endpoint: "", model: "" },
        };
        set(defaults[provider]);
      },
      setEndpoint: (endpoint) => set({ endpoint }),
      setModel: (model) => set({ model }),
      addChatMessage: (message) => set((s) => ({ chatMessages: [...s.chatMessages, message] })),
      clearChat: () => set({ chatMessages: [] }),
    }),
    {
      name: "codenow-ai",
      partialize: (s) => ({
        provider: s.provider,
        endpoint: s.endpoint,
        model: s.model,
        chatMessages: s.chatMessages.slice(-30),
      }),
    },
  ),
);
