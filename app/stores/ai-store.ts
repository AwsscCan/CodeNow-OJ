"use client";

import { create } from "zustand";
import type { ConversationMetadata } from "../lib/conversation-api";

export type AiProvider = "deepseek" | "openai" | "custom" | "ccswitch";
export type ChatMessage = { role: "user" | "assistant"; content: string; reasoning?: string };
export type PublicAiSettings = {
  configured: boolean;
  provider: AiProvider;
  endpoint: string;
  model: string;
  source: "manual" | "ccswitch";
  hasApiKey: boolean;
  version: number;
  updatedAt: string | null;
  wireApi?: "chat_completions" | "responses" | "anthropic";
};

type ConversationCache = {
  conversationAccountId: string | null;
  conversationId: string | null;
  conversationVersion: number;
  conversations: ConversationMetadata[];
  chatMessages: ChatMessage[];
};

type AiStore = ConversationCache & PublicAiSettings & {
  hydrateSettings: (settings: PublicAiSettings) => void;
  clearSettings: () => void;
  addChatMessage: (message: ChatMessage) => void;
  clearChat: () => void;
  switchConversationAccount: (userId: string | null) => void;
  hydrateConversation: (userId: string, conversationId: string | null, version: number, messages: ChatMessage[], conversations: ConversationMetadata[]) => void;
  setConversationVersion: (version: number) => void;
  setConversations: (conversations: ConversationMetadata[]) => void;
};

const EMPTY_SETTINGS: PublicAiSettings = {
  configured: false,
  provider: "deepseek",
  endpoint: "https://api.deepseek.com",
  model: "deepseek-chat",
  source: "manual",
  hasApiKey: false,
  version: 0,
  updatedAt: null,
  wireApi: "chat_completions",
};

const EMPTY_CACHE: ConversationCache = {
  conversationAccountId: null,
  conversationId: null,
  conversationVersion: 0,
  conversations: [],
  chatMessages: [],
};

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

export const useAiStore = create<AiStore>((set) => ({
      ...EMPTY_SETTINGS,
      ...loadConversationCache(),
      hydrateSettings: (settings) => set(settings),
      clearSettings: () => set(EMPTY_SETTINGS),
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
    }));

function conversationCache(state: AiStore): ConversationCache {
  return {
    conversationAccountId: state.conversationAccountId,
    conversationId: state.conversationId,
    conversationVersion: state.conversationVersion,
    conversations: state.conversations,
    chatMessages: state.chatMessages,
  };
}
