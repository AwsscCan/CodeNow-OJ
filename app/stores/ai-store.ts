"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ConversationMetadata } from "../lib/conversation-api";

export type AiProvider = "deepseek" | "openai" | "custom";
export type ChatMessage = { role: "user" | "assistant"; content: string };

type ConversationCache = {
  conversationAccountId: string | null;
  conversationId: string | null;
  conversationVersion: number;
  conversations: ConversationMetadata[];
  chatMessages: ChatMessage[];
};

type AiStore = ConversationCache & {
  apiKeys: Record<AiProvider, string>;
  provider: AiProvider;
  endpoint: string;
  model: string;
  setApiKey: (provider: AiProvider, value: string) => void;
  clearApiKey: (provider: AiProvider) => void;
  setProvider: (provider: AiProvider) => void;
  setEndpoint: (endpoint: string) => void;
  setModel: (model: string) => void;
  addChatMessage: (message: ChatMessage) => void;
  clearChat: () => void;
  switchConversationAccount: (userId: string | null) => void;
  hydrateConversation: (userId: string, conversationId: string | null, version: number, messages: ChatMessage[], conversations: ConversationMetadata[]) => void;
  setConversationVersion: (version: number) => void;
  setConversations: (conversations: ConversationMetadata[]) => void;
};

const EMPTY_CACHE: ConversationCache = {
  conversationAccountId: null,
  conversationId: null,
  conversationVersion: 0,
  conversations: [],
  chatMessages: [],
};

function loadKeys(): Record<AiProvider, string> {
  if (typeof localStorage === "undefined") return { deepseek: "", openai: "", custom: "" };
  try {
    const saved = localStorage.getItem("codenow-api-keys") || localStorage.getItem("codeforge-api-keys");
    if (saved) {
      const keys = JSON.parse(saved);
      return {
        deepseek: typeof keys.deepseek === "string" ? keys.deepseek : "",
        openai: typeof keys.openai === "string" ? keys.openai : "",
        custom: typeof keys.custom === "string" ? keys.custom : "",
      };
    }
  } catch { /* ignore invalid local configuration */ }
  return { deepseek: "", openai: "", custom: "" };
}

function saveKeys(keys: Record<AiProvider, string>) {
  if (typeof localStorage !== "undefined") localStorage.setItem("codenow-api-keys", JSON.stringify(keys));
}

function loadConversationCache(): ConversationCache {
  if (typeof localStorage === "undefined") return EMPTY_CACHE;
  try {
    const value = JSON.parse(localStorage.getItem("codenow-ai-conversation-cache") || "null") as Partial<ConversationCache> | null;
    if (!value || !Array.isArray(value.chatMessages) || !Array.isArray(value.conversations)) return EMPTY_CACHE;
    return {
      conversationAccountId: typeof value.conversationAccountId === "string" ? value.conversationAccountId : null,
      conversationId: typeof value.conversationId === "string" ? value.conversationId : null,
      conversationVersion: Number.isInteger(value.conversationVersion) ? Number(value.conversationVersion) : 0,
      conversations: value.conversations,
      chatMessages: value.chatMessages.filter((message): message is ChatMessage => Boolean(message
        && (message.role === "user" || message.role === "assistant") && typeof message.content === "string")).slice(-100),
    };
  } catch {
    return EMPTY_CACHE;
  }
}

function saveConversationCache(cache: ConversationCache) {
  if (typeof localStorage !== "undefined") localStorage.setItem("codenow-ai-conversation-cache", JSON.stringify(cache));
}

const initialCache = loadConversationCache();

export const useAiStore = create<AiStore>()(
  persist(
    (set, get) => ({
      apiKeys: loadKeys(),
      provider: "deepseek" as AiProvider,
      endpoint: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      ...initialCache,

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
        const defaults: Record<AiProvider, { endpoint: string; model: string }> = {
          deepseek: { endpoint: "https://api.deepseek.com", model: "deepseek-v4-flash" },
          openai: { endpoint: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
          custom: { endpoint: "", model: "" },
        };
        set({ provider, ...defaults[provider] });
      },
      setEndpoint: (endpoint) => set({ endpoint }),
      setModel: (model) => set({ model }),
      addChatMessage: (message) => set((state) => {
        const cache = { ...conversationCache(state), chatMessages: [...state.chatMessages, message].slice(-100) };
        saveConversationCache(cache);
        return cache;
      }),
      clearChat: () => set((state) => {
        const cache = { ...conversationCache(state), chatMessages: [] };
        saveConversationCache(cache);
        return cache;
      }),
      switchConversationAccount: (userId) => set((state) => {
        if (state.conversationAccountId === userId) return state;
        const cache = { ...EMPTY_CACHE, conversationAccountId: userId };
        saveConversationCache(cache);
        return cache;
      }),
      hydrateConversation: (userId, conversationId, conversationVersion, chatMessages, conversations) => set(() => {
        const cache = { conversationAccountId: userId, conversationId, conversationVersion, chatMessages, conversations };
        saveConversationCache(cache);
        return cache;
      }),
      setConversationVersion: (conversationVersion) => set((state) => {
        const cache = { ...conversationCache(state), conversationVersion };
        saveConversationCache(cache);
        return cache;
      }),
      setConversations: (conversations) => set((state) => {
        const cache = { ...conversationCache(state), conversations };
        saveConversationCache(cache);
        return cache;
      }),
    }),
    {
      name: "codenow-ai-local-config",
      partialize: (state) => ({ provider: state.provider, endpoint: state.endpoint, model: state.model }),
    },
  ),
);

function conversationCache(state: AiStore): ConversationCache {
  return {
    conversationAccountId: state.conversationAccountId,
    conversationId: state.conversationId,
    conversationVersion: state.conversationVersion,
    conversations: state.conversations,
    chatMessages: state.chatMessages,
  };
}
